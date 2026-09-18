const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { classifyReport } = require('./classifier');
const { createCase, updateCase, findMatchingCase, getAllCases, getCaseById } = require('./db');
const { calculateConfidenceScore } = require('./confidence');
const { transcribeAudio } = require('./transcribe');
const { fuzzyMatchLocation } = require('./location');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount WhatsApp Cloud API Webhook
app.use('/webhook', require('./whatsapp'));

// Load locations gazetteer
let locationsData = [];
try {
  const locPath = path.join(__dirname, '..', 'data', 'locations.json');
  if (fs.existsSync(locPath)) {
    locationsData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
  }
} catch (err) {
  console.warn('[App] Could not load locations.json:', err.message);
}

// Load actors config
let actorsData = {};
try {
  const actorsPath = path.join(__dirname, '..', 'data', 'actors.json');
  if (fs.existsSync(actorsPath)) {
    actorsData = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));
  }
} catch (err) {
  console.warn('[App] Could not load actors.json:', err.message);
}

/**
 * Match location text against gazetteer or override with explicit lat/lng using fuzzy location resolution.
 */
function resolveLocation(locationText, inputLat, inputLng) {
  let lat = (inputLat !== undefined && inputLat !== null) ? Number(inputLat) : null;
  let lng = (inputLng !== undefined && inputLng !== null) ? Number(inputLng) : null;

  const matchedLoc = fuzzyMatchLocation(locationText, locationsData);

  if (matchedLoc) {
    if (lat === null) lat = matchedLoc.lat;
    if (lng === null) lng = matchedLoc.lng;
    return { lat, lng, location_text: matchedLoc.name };
  }

  return { lat, lng, location_text: locationText || null };
}

/**
 * Get configured actor and SLA for type & severity, along with demo_route settings.
 */
function getActorAndSla(type, severity) {
  if (actorsData[type] && actorsData[type][severity]) {
    return actorsData[type][severity];
  }
  return {
    responsible_actor: 'Local community desk officer',
    sla: '24 hours'
  };
}

/**
 * Core intake processing logic for reports (text or voice).
 */
async function processReportIntake({ text, inputLat, inputLng, isVoice = false, transcript = null, transcribedBy = null }) {
  const reportText = text.trim();

  // 1. Classification via LLM / Hardened Fallback
  const classification = await classifyReport(reportText);

  // 2. Non-incident handling
  if (!classification.is_incident) {
    return {
      success: true,
      case: null,
      note: 'Message classified as non-incident query.'
    };
  }

  // 3. Gazetteer / Fuzzy Location Resolution
  const locationInfo = resolveLocation(
    classification.location_text || reportText,
    inputLat,
    inputLng
  );

  const now = new Date().toISOString();

  // 4. Check for matching active case within 60-min window (Deduplication / Corroboration)
  const existingCase = findMatchingCase(
    classification.type,
    locationInfo.location_text,
    locationInfo.lat,
    locationInfo.lng,
    60
  );

  let targetCase;

  if (existingCase) {
    // Merge report into existing case as evidence
    console.log(`[Intake] Corroborating report matched existing case ${existingCase.id}. Merging evidence.`);

    const evidenceEntry = isVoice
      ? { type: 'voice', text: reportText, transcript: transcript || reportText, transcribed_by: transcribedBy || 'whisper', at: now }
      : reportText;

    const updatedEvidence = [...existingCase.evidence, evidenceEntry];
    const corroboratingCount = updatedEvidence.length - 1;

    const hasGeospatial = Boolean(existingCase.lat || locationInfo.lat);
    const hasMedia = isVoice || updatedEvidence.some(e => typeof e === 'object' && e.type === 'voice');

    const newConfidenceScore = calculateConfidenceScore({
      corroboratingCount,
      hasGeospatial,
      hasMedia
    });

    const updatedHistory = [
      ...existingCase.history,
      { status: 'Corroborating', at: now, note: 'Corroborating report received and merged into case' }
    ];

    targetCase = {
      ...existingCase,
      status: 'Corroborating',
      confidence_score: newConfidenceScore,
      evidence: updatedEvidence,
      history: updatedHistory,
      lat: existingCase.lat || locationInfo.lat,
      lng: existingCase.lng || locationInfo.lng,
      location_text: existingCase.location_text || locationInfo.location_text,
      transcript: transcript || existingCase.transcript,
      transcribed_by: transcribedBy || existingCase.transcribed_by || null
    };
  } else {
    // Create new Case at status 'Signal'
    const hasGeospatial = Boolean(locationInfo.lat);
    const hasMedia = isVoice;

    const initialConfidence = calculateConfidenceScore({
      corroboratingCount: 0,
      hasGeospatial,
      hasMedia
    });

    const actorSla = getActorAndSla(classification.type, classification.severity);

    targetCase = createCase({
      status: 'Signal',
      type: classification.type,
      severity: classification.severity,
      urgency: classification.urgency,
      confidence_score: initialConfidence,
      responsible_actor: classification.responsible_actor || actorSla.responsible_actor,
      sla: classification.sla || actorSla.sla,
      evidence: isVoice ? [{ type: 'voice', text: reportText, transcript: transcript || reportText, transcribed_by: transcribedBy || 'whisper', at: now }] : [reportText],
      raw_report: reportText,
      lat: locationInfo.lat,
      lng: locationInfo.lng,
      location_text: locationInfo.location_text,
      transcript: transcript || null,
      transcribed_by: transcribedBy || null,
      classified_by: classification.classified_by || 'llm',
      history: [{ status: 'Signal', at: now, note: 'Initial signal received' }]
    });
  }

  // 5. Automated Status Transitions & SLA Assignment Workflow
  // Rule:
  // Verified requires at least 2 independent reports (evidence.length >= 2) AND confidence >= 60.
  // Exception: Scripted demo scenarios (demo_route: true in data/actors.json) for shallow paths (Mile 12 and Ijegun).
  const actorConfig = getActorAndSla(targetCase.type, targetCase.severity);
  const isDemoRoute = Boolean(actorConfig && actorConfig.demo_route);

  if (isDemoRoute) {
    const stopStatus = actorConfig.stop_status || 'Assigned';

    // Transition Signal -> Verified -> Assigned -> (stopStatus) for demo routing
    if (targetCase.status === 'Signal' || targetCase.status === 'Corroborating') {
      targetCase.status = 'Verified';
      targetCase.history.push({
        status: 'Verified',
        at: now,
        note: 'demo scenario: scripted routing'
      });
    }

    if (targetCase.status === 'Verified') {
      targetCase.status = 'Assigned';
      targetCase.responsible_actor = actorConfig.responsible_actor;
      targetCase.sla = actorConfig.sla;
      targetCase.history.push({
        status: 'Assigned',
        at: now,
        note: 'demo scenario: scripted routing'
      });
    }

    if (targetCase.status === 'Assigned' && stopStatus === 'Accepted') {
      targetCase.status = 'Accepted';
      targetCase.acknowledged_at = now;
      targetCase.history.push({
        status: 'Accepted',
        at: now,
        note: 'demo scenario: scripted routing'
      });
    }
  } else {
    // Normal multi-report verification workflow
    const reportCount = targetCase.evidence.length;
    if (reportCount >= 2 && targetCase.confidence_score >= 60 && (targetCase.status === 'Signal' || targetCase.status === 'Corroborating')) {
      targetCase.status = 'Verified';
      targetCase.history.push({
        status: 'Verified',
        at: now,
        note: `Verified with ${reportCount} independent reports and confidence score (${targetCase.confidence_score}) >= 60`
      });
    }

    if (targetCase.status === 'Verified') {
      const actorSla = getActorAndSla(targetCase.type, targetCase.severity);
      targetCase.responsible_actor = actorSla.responsible_actor;
      targetCase.sla = actorSla.sla;
      targetCase.status = 'Assigned';
      targetCase.history.push({
        status: 'Assigned',
        at: now,
        note: `Assigned to ${targetCase.responsible_actor} with SLA ${targetCase.sla}`
      });
    }

    if (targetCase.status === 'Assigned') {
      targetCase.status = 'Accepted';
      targetCase.acknowledged_at = now;
      targetCase.history.push({
        status: 'Accepted',
        at: now,
        note: `Scripted responder (${targetCase.responsible_actor}) auto-accepted assignment`
      });
    }
  }

  // Save updated case record to DB
  const savedCase = updateCase(targetCase.id, targetCase);

  return {
    success: true,
    case: savedCase
  };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Relay Intake & Classification API' });
});

// Endpoint: Ingest text report & process pipeline
app.post('/api/reports', async (req, res) => {
  try {
    const reportText = req.body.text || req.body.report;
    if (!reportText || typeof reportText !== 'string' || !reportText.trim()) {
      return res.status(400).json({ error: 'Field "text" or "report" is required and must be a non-empty string.' });
    }

    const result = await processReportIntake({
      text: reportText,
      inputLat: req.body.lat,
      inputLng: req.body.lng
    });

    if (!result.case) {
      return res.json({ success: true, case: null, note: result.note });
    }

    return res.status(201).json({
      success: true,
      case: result.case
    });
  } catch (err) {
    console.error('[Ingest Error]', err);
    return res.status(500).json({ error: 'Internal server error processing report.' });
  }
});

// Endpoint: Voice report intake via multipart audio file
app.post('/api/reports/voice', upload.any(), async (req, res) => {
  try {
    const file = req.files && req.files.length > 0 ? req.files[0] : req.file;

    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Audio file upload is required.' });
    }

    let transcriptionResult;
    try {
      transcriptionResult = await transcribeAudio(file.buffer, file.originalname, file.mimetype);
    } catch (err) {
      console.error('[Voice Intake Transcription Failed]', err.message);
      return res.status(502).json({
        success: false,
        error: 'transcription_failed',
        detail: err.message
      });
    }

    const result = await processReportIntake({
      text: transcriptionResult.text,
      inputLat: req.body.lat,
      inputLng: req.body.lng,
      isVoice: true,
      transcript: transcriptionResult.text,
      transcribedBy: transcriptionResult.transcribedBy
    });

    if (!result.case) {
      return res.json({ success: true, case: null, note: result.note });
    }

    return res.status(201).json({
      success: true,
      case: result.case
    });
  } catch (err) {
    console.error('[Voice Intake Error]', err);
    return res.status(500).json({ error: 'Internal server error processing voice report.' });
  }
});

// Endpoint: Alias POST /api/cases -> POST /api/reports
app.post('/api/cases', async (req, res) => {
  return app._router.handle(req, res, () => {}, '/api/reports');
});

// Endpoint: List all cases
app.get('/api/cases', (req, res) => {
  try {
    const cases = getAllCases();
    return res.json({ cases });
  } catch (err) {
    console.error('[List Cases Error]', err);
    return res.status(500).json({ error: 'Failed to retrieve cases.' });
  }
});

// Endpoint: Get specific case by ID
app.get('/api/cases/:id', (req, res) => {
  try {
    const caseRecord = getCaseById(req.params.id);
    if (!caseRecord) {
      return res.status(404).json({ error: `Case '${req.params.id}' not found.` });
    }
    return res.json({ case: caseRecord });
  } catch (err) {
    console.error('[Get Case Error]', err);
    return res.status(500).json({ error: 'Failed to retrieve case.' });
  }
});

module.exports = app;
module.exports.processReportIntake = processReportIntake;

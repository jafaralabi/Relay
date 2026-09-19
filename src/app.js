const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const crypto = require('crypto');
const { classifyReport } = require('./classifier');
const { createCase, updateCase, findMatchingCase, getAllCases, getCaseById } = require('./db');
const { calculateConfidenceScore } = require('./confidence');
const { transcribeAudio } = require('./transcribe');
const { fuzzyMatchLocation } = require('./location');
const { seedDemoData, resetAll } = require('./demo');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const app = express();

app.set('trust proxy', true);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(require('path').join(__dirname, '..', 'public')));

// In-memory rate limiter for public intake (10 reports / IP / 10 min)
const intakeRateMap = new Map();
function intakeRateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  if (!intakeRateMap.has(ip)) {
    intakeRateMap.set(ip, []);
  }

  const timestamps = intakeRateMap.get(ip).filter(t => now - t < windowMs);
  if (timestamps.length >= 10) {
    return res.status(429).json({ error: 'Too many reports submitted from this IP. Please wait a few minutes and try again.' });
  }

  timestamps.push(now);
  intakeRateMap.set(ip, timestamps);
  next();
}

// Demo key protection middleware
function demoKeyAuth(req, res, next) {
  const reqKey = req.headers['x-demo-key'];
  const envKey = process.env.DEMO_KEY;

  if (envKey && envKey.trim().length > 0) {
    if (reqKey === envKey) return next();
    return res.status(401).json({ error: 'Unauthorized: Invalid x-demo-key header.' });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Unauthorized: DEMO_KEY is required in production environment.' });
  }

  next();
}

function hashReporter(reporterId) {
  if (!reporterId) return null;
  const salt = process.env.REPORTER_SALT || 'relay_local_dev_salt_2026';
  return crypto.createHmac('sha256', salt).update(String(reporterId).trim()).digest('hex');
}

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
async function processReportIntake({ text, inputLat, inputLng, isVoice = false, transcript = null, transcribedBy = null, reporter = null, notifyTo = null }) {
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
  const reporterHash = reporter ? hashReporter(reporter) : null;

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
      { status: 'Corroborating', at: now, note: 'Corroborating report received and merged into case', t_plus_minutes: 6 }
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
      transcribed_by: transcribedBy || existingCase.transcribed_by || null,
      notify_to: notifyTo || existingCase.notify_to || null
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
      reporter_hash: reporterHash,
      notify_to: notifyTo || null,
      history: [{ status: 'Signal', at: now, note: 'Initial signal received', t_plus_minutes: 0 }]
    });
  }

  // 5. Automated Status Transitions & SLA Assignment Workflow
  const actorConfig = getActorAndSla(targetCase.type, targetCase.severity);
  const isDemoRoute = Boolean(actorConfig && actorConfig.demo_route);

  if (isDemoRoute) {
    targetCase.demo_scripted = true;
    const stopStatus = actorConfig.stop_status || 'Assigned';

    if (targetCase.status === 'Signal' || targetCase.status === 'Corroborating') {
      targetCase.status = 'Verified';
      targetCase.history.push({
        status: 'Verified',
        at: now,
        note: 'demo scenario: scripted routing',
        t_plus_minutes: 2
      });
    }

    if (targetCase.status === 'Verified') {
      targetCase.status = 'Assigned';
      targetCase.responsible_actor = actorConfig.responsible_actor;
      targetCase.sla = actorConfig.sla;
      targetCase.history.push({
        status: 'Assigned',
        at: now,
        note: 'demo scenario: scripted routing',
        t_plus_minutes: 3
      });
    }

    if (targetCase.status === 'Assigned' && stopStatus === 'Accepted') {
      targetCase.status = 'Accepted';
      targetCase.acknowledged_at = now;
      const simAckMinutes = actorConfig.simulated_ack_minutes || 45;
      targetCase.acknowledged_after_minutes = simAckMinutes;
      targetCase.ack_simulated = true;
      targetCase.history.push({
        status: 'Accepted',
        at: now,
        note: 'demo scenario: scripted routing',
        t_plus_minutes: simAckMinutes
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
        note: `Verified with ${reportCount} independent reports and confidence score (${targetCase.confidence_score}) >= 60`,
        t_plus_minutes: 6
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
        note: `Assigned to ${targetCase.responsible_actor} with SLA ${targetCase.sla}`,
        t_plus_minutes: 7
      });
    }

    if (targetCase.status === 'Assigned') {
      targetCase.status = 'Accepted';
      targetCase.acknowledged_at = now;
      const simAckMinutes = actorConfig.simulated_ack_minutes || 22;
      targetCase.acknowledged_after_minutes = simAckMinutes;
      targetCase.ack_simulated = true;
      targetCase.history.push({
        status: 'Accepted',
        at: now,
        note: `Scripted responder (${targetCase.responsible_actor}) auto-accepted assignment`,
        t_plus_minutes: simAckMinutes
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

/**
 * Call Groq model to verify if text confirms an incident is resolved.
 * Returns boolean confirmation or throws Error if unavailable.
 */
async function callGroqVerificationModel(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY missing in environment.');
  }

  const primaryModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const fallbackModelsEnv = process.env.GROQ_FALLBACK_MODELS || 'openai/gpt-oss-20b,qwen/qwen3.8-27b';
  const fallbackModels = fallbackModelsEnv.split(',').map(m => m.trim()).filter(Boolean);
  const candidateModels = [primaryModel, ...fallbackModels];

  const verifyPrompt = `You are a verification AI for Relay civic intelligence.
Determine whether the following community report text explicitly confirms that a reported situation, threat, or incident has calmed, ended, or resolved (e.g. market calm, shops reopened, fight stopped, water restored).

Report text:
"${text.trim()}"

Respond strictly with a JSON object:
{ "confirms": true } or { "confirms": false }
Do not include any additional explanation or formatting.`;

  for (const modelId of candidateModels) {
    try {
      const payload = {
        model: modelId,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 150,
        messages: [{ role: 'user', content: verifyPrompt }]
      };
      if (modelId.includes('gpt-oss')) payload.reasoning_effort = 'low';

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        const contentText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (contentText) {
          const parsed = JSON.parse(contentText.trim());
          return Boolean(parsed.confirms);
        }
      }
    } catch (err) {
      console.warn(`[Verification AI] Model ${modelId} failed: ${err.message}`);
    }
  }

  throw new Error('All model verification attempts failed.');
}

/**
 * Optional stretch: Send WhatsApp notification on status change if notify_to is set.
 */
async function notifyReporterStatus(caseRecord, message) {
  const dbRow = require('./db').db.prepare('SELECT notify_to FROM cases WHERE id = ?').get(caseRecord.id);
  const notifyTo = dbRow ? dbRow.notify_to : null;
  if (notifyTo) {
    try {
      const { sendWhatsAppMessage } = require('./whatsapp');
      if (typeof sendWhatsAppMessage === 'function') {
        await sendWhatsAppMessage(notifyTo, message);
      }
    } catch (err) {
      console.warn(`[WhatsApp Notify Warning] Could not notify ${notifyTo}: ${err.message}`);
    }
  }
}

// Endpoint: Ingest text report & process pipeline
app.post('/api/reports', intakeRateLimiter, async (req, res) => {
  try {
    const reportText = req.body.text || req.body.report;
    if (!reportText || typeof reportText !== 'string' || !reportText.trim()) {
      return res.status(400).json({ error: 'Field "text" or "report" is required and must be a non-empty string.' });
    }

    if (reportText.length > 1000) {
      return res.status(400).json({ error: 'Report text exceeds maximum length of 1000 characters.' });
    }

    const reporterId = req.body.reporter || req.body.phone || req.headers['x-reporter-id'] || null;

    const result = await processReportIntake({
      text: reportText,
      inputLat: req.body.lat,
      inputLng: req.body.lng,
      reporter: reporterId
    });

    if (!result.case) {
      return res.json({ success: true, case: null, note: result.note });
    }

    return res.status(201).json({
      success: true,
      case: result.case
    });
  } catch (err) {
    console.error('[Ingest Error]', err.message);
    return res.status(500).json({ error: 'Internal server error processing report.' });
  }
});

// Endpoint: Voice report intake via multipart audio file
app.post('/api/reports/voice', intakeRateLimiter, upload.any(), async (req, res) => {
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

    const reporterId = req.body.reporter || req.body.phone || req.headers['x-reporter-id'] || null;

    const result = await processReportIntake({
      text: transcriptionResult.text,
      inputLat: req.body.lat,
      inputLng: req.body.lng,
      isVoice: true,
      transcript: transcriptionResult.text,
      transcribedBy: transcriptionResult.transcribedBy,
      reporter: reporterId
    });

    if (!result.case) {
      return res.json({ success: true, case: null, note: result.note });
    }

    return res.status(201).json({
      success: true,
      case: result.case
    });
  } catch (err) {
    console.error('[Voice Intake Error]', err.message);
    return res.status(500).json({ error: 'Internal server error processing voice report.' });
  }
});

// Endpoint: Alias POST /api/cases -> POST /api/reports
app.post('/api/cases', intakeRateLimiter, async (req, res) => {
  return app._router.handle(req, res, () => {}, '/api/reports');
});

// Endpoint: Advance case status (Accepted -> In Progress -> Claimed Resolved)
app.post('/api/cases/:id/advance', demoKeyAuth, async (req, res) => {
  try {
    const caseRecord = getCaseById(req.params.id);
    if (!caseRecord) {
      return res.status(404).json({ error: `Case '${req.params.id}' not found.` });
    }

    if (caseRecord.demo_scripted) {
      return res.status(409).json({ error: `Case '${caseRecord.id}' is a scripted demo case and cannot be advanced beyond its designated route status.` });
    }

    const now = new Date().toISOString();
    let targetStatus;
    let defaultAction;
    let defaultNote;
    let computedTPlus;

    const ackMinutes = caseRecord.acknowledged_after_minutes || 22;

    if (caseRecord.status === 'Accepted') {
      targetStatus = 'In Progress';
      defaultAction = req.body.action || req.body.note || 'Responders on site';
      defaultNote = defaultAction;
      computedTPlus = req.body.minutes_elapsed !== undefined ? Number(req.body.minutes_elapsed) : (ackMinutes + 3);
    } else if (caseRecord.status === 'In Progress') {
      targetStatus = 'Claimed Resolved';
      defaultAction = req.body.action || req.body.note || 'Responders dispersed the group, no injuries';
      defaultNote = defaultAction;

      const inProgressTPlus = caseRecord.history.find(h => h.status === 'In Progress')?.t_plus_minutes || (ackMinutes + 3);
      computedTPlus = req.body.minutes_elapsed !== undefined ? Number(req.body.minutes_elapsed) : (inProgressTPlus + 16);
    } else {
      return res.status(409).json({ error: `Cannot advance case '${caseRecord.id}' from status '${caseRecord.status}'. Case advance is allowed only from 'Accepted' or 'In Progress'.` });
    }

    const updatedHistory = [
      ...caseRecord.history,
      { status: targetStatus, at: now, note: defaultNote, t_plus_minutes: computedTPlus }
    ];

    const updateFields = {
      status: targetStatus,
      action: defaultAction,
      history: updatedHistory
    };

    if (targetStatus === 'Claimed Resolved') {
      updateFields.resolution = 'Claimed';
    }

    const updatedCase = updateCase(caseRecord.id, updateFields);

    if (targetStatus === 'Claimed Resolved') {
      await notifyReporterStatus(updatedCase, `Your report ${updatedCase.id} has been claimed as resolved by responders.`);
    }

    return res.json({ success: true, case: updatedCase });
  } catch (err) {
    console.error('[Advance Error]', err.message);
    return res.status(500).json({ error: 'Internal server error advancing case.' });
  }
});

// Endpoint: Independently verify case resolution
app.post('/api/cases/:id/verify', demoKeyAuth, async (req, res) => {
  try {
    const caseRecord = getCaseById(req.params.id);
    if (!caseRecord) {
      return res.status(404).json({ error: `Case '${req.params.id}' not found.` });
    }

    if (caseRecord.status !== 'Claimed Resolved') {
      return res.status(409).json({ error: `Case '${caseRecord.id}' cannot be independently verified because its status is '${caseRecord.status}' (must be 'Claimed Resolved').` });
    }

    const verifyText = req.body.text;
    if (!verifyText || typeof verifyText !== 'string' || !verifyText.trim()) {
      return res.status(400).json({ error: 'Field "text" is required and must be a non-empty string.' });
    }

    const verifierId = req.body.reporter || req.headers['x-reporter-id'] || null;
    if (verifierId) {
      const verifierHash = hashReporter(verifierId);
      const dbRow = require('./db').db.prepare('SELECT reporter_hash FROM cases WHERE id = ?').get(caseRecord.id);
      const originalReporterHash = dbRow ? dbRow.reporter_hash : null;

      if (verifierHash && originalReporterHash && verifierHash === originalReporterHash) {
        return res.status(409).json({ error: 'Verification report must come from an independent community member, not the original reporter or responder.' });
      }
    }

    let confirms = false;
    try {
      confirms = await callGroqVerificationModel(verifyText);
    } catch (err) {
      console.error('[Verification Model Error]', err.message);
      return res.status(503).json({ error: 'Model unavailable for verification.' });
    }

    if (!confirms) {
      return res.json({ success: true, confirmed: false, case: caseRecord });
    }

    const now = new Date().toISOString();
    const claimedTPlus = caseRecord.history.find(h => h.status === 'Claimed Resolved')?.t_plus_minutes || 41;
    const computedTPlus = req.body.minutes_elapsed !== undefined ? Number(req.body.minutes_elapsed) : (claimedTPlus + 20);

    const independentVerification = {
      at: now,
      text: verifyText.trim(),
      t_plus_minutes: computedTPlus
    };

    const updatedEvidence = [
      ...caseRecord.evidence,
      { type: 'independent_verification', text: verifyText.trim(), at: now, t_plus_minutes: computedTPlus }
    ];

    const updatedHistory = [
      ...caseRecord.history,
      { status: 'Independently Verified', at: now, note: 'Confirmed by an independent community report', t_plus_minutes: computedTPlus }
    ];

    const updatedCase = updateCase(caseRecord.id, {
      status: 'Independently Verified',
      resolution: 'Independently Verified',
      closed: true,
      independent_verification: independentVerification,
      evidence: updatedEvidence,
      history: updatedHistory
    });

    await notifyReporterStatus(updatedCase, `Your report ${updatedCase.id} has been independently verified as resolved.`);

    return res.json({ success: true, confirmed: true, case: updatedCase });
  } catch (err) {
    console.error('[Verify Endpoint Error]', err.message);
    return res.status(500).json({ error: 'Internal server error verifying case.' });
  }
});

// Endpoint: Seed demo data
app.post('/api/demo/seed', demoKeyAuth, (req, res) => {
  try {
    const cases = seedDemoData();
    return res.json({ success: true, cases });
  } catch (err) {
    console.error('[Demo Seed Error]', err.message);
    return res.status(500).json({ error: 'Failed to seed demo data.' });
  }
});

// Endpoint: Reset demo data
app.post('/api/demo/reset', demoKeyAuth, (req, res) => {
  try {
    intakeRateMap.clear();
    const cases = resetAll();
    return res.json({ success: true, cases });
  } catch (err) {
    console.error('[Demo Reset Error]', err.message);
    return res.status(500).json({ error: 'Failed to reset demo data.' });
  }
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

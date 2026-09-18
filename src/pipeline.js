const path = require('path');
const fs = require('fs');
const { createCase, updateCase, getCaseById, getAllCases, findMatchingActiveCase } = require('./db');
const { classifyReport } = require('./classifier');
const { calculateConfidenceScore } = require('./confidence');

// Load static gazetteer and actor data
const locationsPath = path.join(__dirname, '..', 'data', 'locations.json');
const actorsPath = path.join(__dirname, '..', 'data', 'actors.json');

const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
const actorsData = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));

/**
 * Resolves location coordinates and canonical location text from gazetteer or explicit body.
 */
function resolveLocation(locationText, inputLat, inputLng) {
  let lat = inputLat !== undefined && inputLat !== null ? Number(inputLat) : null;
  let lng = inputLng !== undefined && inputLng !== null ? Number(inputLng) : null;
  let canonicalText = locationText || 'Unknown';

  if (locationText && locationText !== 'Unknown') {
    const locLower = locationText.toLowerCase();
    const matched = locations.find(loc =>
      loc.keywords.some(kw => locLower.includes(kw.toLowerCase())) ||
      locLower.includes(loc.name.toLowerCase())
    );

    if (matched) {
      if (lat === null) lat = matched.lat;
      if (lng === null) lng = matched.lng;
      canonicalText = matched.name;
    }
  }

  return { lat, lng, location_text: canonicalText };
}

/**
 * Maps type and severity to responsible actor and SLA.
 */
function resolveActorAndSLA(type, severity) {
  const match = actorsData.mappings.find(
    m => m.type.toLowerCase() === type.toLowerCase() && m.severity.toLowerCase() === severity.toLowerCase()
  );

  if (match) {
    return { actor: match.actor, sla: match.sla };
  }

  return actorsData.default || { actor: 'Local Responder', sla: '48 hours' };
}

function generateId(prefix = 'RLA') {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

/**
 * Main ingestion pipeline for processing a text or voice report.
 */
async function processReport({ text, lat, lng, reporter = 'Anonymous', isVoice = false, transcript = null }) {
  const reportText = isVoice && transcript ? transcript : text;
  if (!reportText) {
    throw new Error('No text or transcript available for report processing.');
  }

  // 1. Classify with LLM (or fallback)
  const classification = await classifyReport(reportText);
  const { type, severity, urgency, location_text: rawLocText } = classification;

  // 2. Resolve location gazetteer
  const resolvedLoc = resolveLocation(rawLocText, lat, lng);

  // 3. Resolve actor & SLA
  const { actor, sla } = resolveActorAndSLA(type, severity);

  const now = new Date().toISOString();
  const evidenceItem = {
    id: generateId('EVD'),
    type: isVoice ? 'voice' : 'text',
    text: reportText,
    channel: isVoice ? 'voice' : 'web',
    reporter,
    created_at: now
  };

  // 4. Check for existing matching active case within 60 mins
  let caseRecord = findMatchingActiveCase(type, resolvedLoc.location_text, resolvedLoc.lat, resolvedLoc.lng, 60);

  if (caseRecord) {
    // --- CORROBORATING REPORT CASE ---
    caseRecord.evidence.push(evidenceItem);

    if (isVoice && transcript) {
      caseRecord.transcript = transcript;
    }

    caseRecord.history.push({
      status: caseRecord.status === 'Signal' ? 'Corroborating' : caseRecord.status,
      at: now,
      note: `Corroborating report received from ${reporter}`
    });

    if (caseRecord.status === 'Signal') {
      caseRecord.status = 'Corroborating';
    }

    const geoConsistent = caseRecord.lat !== null && caseRecord.lng !== null;
    const mediaPresent = caseRecord.evidence.some(e => e.type === 'voice');
    const newConfidence = calculateConfidenceScore({
      corroborationCount: caseRecord.evidence.length,
      geoConsistent,
      mediaPresent,
      hasContradiction: false
    });

    caseRecord.confidence_score = newConfidence;

    evaluateTransitions(caseRecord, actor, sla, now);

    return updateCase(caseRecord.id, caseRecord);

  } else {
    // --- NEW CASE ---
    const caseId = generateId('RLA');
    const geoConsistent = resolvedLoc.lat !== null && resolvedLoc.lng !== null;
    const mediaPresent = isVoice;

    const confidenceScore = calculateConfidenceScore({
      corroborationCount: 1,
      geoConsistent,
      mediaPresent,
      hasContradiction: false
    });

    const newCase = {
      id: caseId,
      status: 'Signal',
      type,
      severity,
      urgency,
      confidence_score: confidenceScore,
      responsible_actor: null,
      sla: null,
      acknowledged_at: null,
      lat: resolvedLoc.lat,
      lng: resolvedLoc.lng,
      location_text: resolvedLoc.location_text,
      transcript: isVoice ? transcript : null,
      evidence: [evidenceItem],
      independent_verification: null,
      history: [
        {
          status: 'Signal',
          at: now,
          note: `Initial signal report received via ${isVoice ? 'voice' : 'text'}`
        }
      ],
      raw_report: reportText,
      classified_by: 'Groq (Llama 3.3 70B)',
      created_at: now,
      updated_at: now
    };

    evaluateTransitions(newCase, actor, sla, now);

    return createCase(newCase);
  }
}

/**
 * Handles status schema transitions: Signal/Corroborating -> Verified -> Assigned -> Accepted
 */
function evaluateTransitions(c, actor, sla, now) {
  if (c.confidence_score >= 60 && (c.status === 'Signal' || c.status === 'Corroborating')) {
    c.status = 'Verified';
    c.history.push({
      status: 'Verified',
      at: now,
      note: `Confidence score reached ${c.confidence_score}% (threshold: 60%)`
    });
  }

  if (c.status === 'Verified') {
    c.status = 'Assigned';
    c.responsible_actor = actor;
    c.sla = sla;
    c.history.push({
      status: 'Assigned',
      at: now,
      note: `Assigned to ${actor} with SLA of ${sla}`
    });
  }

  if (c.status === 'Assigned') {
    const isMediumTransparency = c.type === 'Transparency' && c.severity === 'Medium';
    if (!isMediumTransparency) {
      c.status = 'Accepted';
      c.acknowledged_at = now;
      c.history.push({
        status: 'Accepted',
        at: now,
        note: `SLA acknowledged by ${c.responsible_actor}`
      });
    }
  }
}

module.exports = {
  processReport,
  resolveLocation,
  resolveActorAndSLA
};

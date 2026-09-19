const { db, createCase, clearCases, getAllCases } = require('./db');
const path = require('path');
const fs = require('fs');

let locationsData = [];
try {
  const locPath = path.join(__dirname, '..', 'data', 'locations.json');
  if (fs.existsSync(locPath)) {
    locationsData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
  }
} catch (err) {
  console.warn('[Demo] Could not load locations.json:', err.message);
}

function getLocationCoords(name) {
  const loc = locationsData.find(l => l.name.toLowerCase() === name.toLowerCase());
  return loc ? { lat: loc.lat, lng: loc.lng, location_text: loc.name } : { lat: null, lng: null, location_text: name };
}

function seedDemoData() {
  clearCases();

  const now = new Date();
  const nowIso = now.toISOString();

  // Helper to subtract minutes from nowIso for created_at
  const subMin = (mins) => new Date(now.getTime() - mins * 60 * 1000).toISOString();

  // 1. Agege Deep Path case - Seeded at Independently Verified
  const agegeLoc = getLocationCoords('Agege market');
  const agegeEnglishReport = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
  const agegePidginReport = "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
  const agegeConfirmText = "The area is calm now, shops have reopened";

  createCase({
    id: 'RLA-1001',
    status: 'Independently Verified',
    type: 'Safety',
    severity: 'High',
    urgency: 'High',
    confidence_score: 100,
    responsible_actor: 'Community security responder + local police PRO contact',
    sla: '30 minutes',
    acknowledged_at: subMin(39),
    action: 'Responders dispersed the group, no injuries',
    acknowledged_after_minutes: 22,
    ack_simulated: true,
    resolution: 'Independently Verified',
    closed: true,
    demo_scripted: false,
    demo_seed: true,
    evidence: [
      agegeEnglishReport,
      agegePidginReport,
      { type: 'independent_verification', text: agegeConfirmText, at: subMin(0), t_plus_minutes: 61 }
    ],
    independent_verification: {
      at: subMin(0),
      text: agegeConfirmText,
      t_plus_minutes: 61
    },
    raw_report: agegeEnglishReport,
    lat: agegeLoc.lat,
    lng: agegeLoc.lng,
    location_text: agegeLoc.location_text,
    classified_by: 'seed',
    history: [
      { status: 'Signal', at: subMin(61), note: 'Initial signal received', t_plus_minutes: 0 },
      { status: 'Corroborating', at: subMin(55), note: 'Corroborating report received and merged into case', t_plus_minutes: 6 },
      { status: 'Verified', at: subMin(55), note: 'Verified with 2 independent reports and confidence score (85) >= 60', t_plus_minutes: 6 },
      { status: 'Assigned', at: subMin(54), note: 'Assigned to Community security responder + local police PRO contact with SLA 30 minutes', t_plus_minutes: 7 },
      { status: 'Accepted', at: subMin(39), note: 'Scripted responder (Community security responder + local police PRO contact) auto-accepted assignment', t_plus_minutes: 22 },
      { status: 'In Progress', at: subMin(36), note: 'Responders on site', t_plus_minutes: 25 },
      { status: 'Claimed Resolved', at: subMin(20), note: 'Responders dispersed the group, no injuries', t_plus_minutes: 41 },
      { status: 'Independently Verified', at: subMin(0), note: 'Confirmed by an independent community report', t_plus_minutes: 61 }
    ]
  });

  // 2. Mile 12 Shallow Path 1 - Seeded at Accepted
  const mile12Loc = getLocationCoords('Mile 12 market');
  const mile12Report = "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming.";

  createCase({
    id: 'RLA-1002',
    status: 'Accepted',
    type: 'Stability',
    severity: 'Medium',
    urgency: 'Medium',
    confidence_score: 45,
    responsible_actor: 'Trained community mediator',
    sla: '24 hours',
    acknowledged_at: subMin(10),
    action: 'Assignment accepted by responder',
    acknowledged_after_minutes: 45,
    ack_simulated: true,
    resolution: 'Pending',
    closed: false,
    demo_scripted: true,
    demo_seed: true,
    evidence: [mile12Report],
    raw_report: mile12Report,
    lat: mile12Loc.lat,
    lng: mile12Loc.lng,
    location_text: mile12Loc.location_text,
    classified_by: 'seed',
    history: [
      { status: 'Signal', at: subMin(55), note: 'Initial signal received', t_plus_minutes: 0 },
      { status: 'Verified', at: subMin(53), note: 'demo scenario: scripted routing', t_plus_minutes: 2 },
      { status: 'Assigned', at: subMin(52), note: 'demo scenario: scripted routing', t_plus_minutes: 3 },
      { status: 'Accepted', at: subMin(10), note: 'demo scenario: scripted routing', t_plus_minutes: 45 }
    ]
  });

  // 3. Ijegun Shallow Path 2 - Seeded at Assigned
  const ijegunLoc = getLocationCoords('Ijegun');
  const ijegunReport = "The borehole at Ijegun primary school has been broken for two weeks, children have no water.";

  createCase({
    id: 'RLA-1003',
    status: 'Assigned',
    type: 'Transparency',
    severity: 'Medium',
    urgency: 'Medium',
    confidence_score: 45,
    responsible_actor: 'Local government works officer',
    sla: '72 hours',
    acknowledged_at: null,
    action: 'Assigned to Local government works officer',
    acknowledged_after_minutes: null,
    ack_simulated: false,
    resolution: 'Pending',
    closed: false,
    demo_scripted: true,
    demo_seed: true,
    evidence: [ijegunReport],
    raw_report: ijegunReport,
    lat: ijegunLoc.lat,
    lng: ijegunLoc.lng,
    location_text: ijegunLoc.location_text,
    classified_by: 'seed',
    history: [
      { status: 'Signal', at: subMin(10), note: 'Initial signal received', t_plus_minutes: 0 },
      { status: 'Verified', at: subMin(8), note: 'demo scenario: scripted routing', t_plus_minutes: 2 },
      { status: 'Assigned', at: subMin(7), note: 'demo scenario: scripted routing', t_plus_minutes: 3 }
    ]
  });

  return getAllCases();
}

function resetAll() {
  clearCases();
  return getAllCases();
}

module.exports = {
  seedDemoData,
  resetAll
};

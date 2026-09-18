const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'relay.db');
const db = new Database(dbPath);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    urgency TEXT NOT NULL,
    confidence_score INTEGER NOT NULL DEFAULT 0,
    responsible_actor TEXT,
    sla TEXT,
    acknowledged_at TEXT,
    lat REAL,
    lng REAL,
    location_text TEXT,
    transcript TEXT,
    evidence TEXT NOT NULL DEFAULT '[]',
    independent_verification TEXT,
    history TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

function formatCaseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    type: row.type,
    severity: row.severity,
    urgency: row.urgency,
    confidence_score: row.confidence_score,
    responsible_actor: row.responsible_actor || null,
    sla: row.sla || null,
    acknowledged_at: row.acknowledged_at || null,
    lat: row.lat !== null ? Number(row.lat) : null,
    lng: row.lng !== null ? Number(row.lng) : null,
    location_text: row.location_text || null,
    transcript: row.transcript || null,
    evidence: JSON.parse(row.evidence || '[]'),
    independent_verification: row.independent_verification ? JSON.parse(row.independent_verification) : null,
    history: JSON.parse(row.history || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function createCase(caseData) {
  const stmt = db.prepare(`
    INSERT INTO cases (
      id, status, type, severity, urgency, confidence_score,
      responsible_actor, sla, acknowledged_at, lat, lng,
      location_text, transcript, evidence, independent_verification, history,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  stmt.run(
    caseData.id,
    caseData.status,
    caseData.type,
    caseData.severity,
    caseData.urgency || 'Medium',
    caseData.confidence_score || 0,
    caseData.responsible_actor || null,
    caseData.sla || null,
    caseData.acknowledged_at || null,
    caseData.lat !== undefined ? caseData.lat : null,
    caseData.lng !== undefined ? caseData.lng : null,
    caseData.location_text || null,
    caseData.transcript || null,
    JSON.stringify(caseData.evidence || []),
    caseData.independent_verification ? JSON.stringify(caseData.independent_verification) : null,
    JSON.stringify(caseData.history || []),
    caseData.created_at,
    caseData.updated_at
  );

  return getCaseById(caseData.id);
}

function updateCase(id, caseData) {
  const existing = getCaseById(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...caseData,
    updated_at: new Date().toISOString()
  };

  const stmt = db.prepare(`
    UPDATE cases SET
      status = ?,
      type = ?,
      severity = ?,
      urgency = ?,
      confidence_score = ?,
      responsible_actor = ?,
      sla = ?,
      acknowledged_at = ?,
      lat = ?,
      lng = ?,
      location_text = ?,
      transcript = ?,
      evidence = ?,
      independent_verification = ?,
      history = ?,
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.status,
    updated.type,
    updated.severity,
    updated.urgency,
    updated.confidence_score,
    updated.responsible_actor,
    updated.sla,
    updated.acknowledged_at,
    updated.lat,
    updated.lng,
    updated.location_text,
    updated.transcript,
    JSON.stringify(updated.evidence),
    updated.independent_verification ? JSON.stringify(updated.independent_verification) : null,
    JSON.stringify(updated.history),
    updated.updated_at,
    id
  );

  return getCaseById(id);
}

function getCaseById(id) {
  const stmt = db.prepare('SELECT * FROM cases WHERE id = ?');
  const row = stmt.get(id);
  return formatCaseRow(row);
}

function getAllCases() {
  const stmt = db.prepare('SELECT * FROM cases ORDER BY created_at DESC');
  const rows = stmt.all();
  return rows.map(formatCaseRow);
}

function findMatchingActiveCase(type, locationText, lat, lng, timeWindowMinutes = 60) {
  const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
  const stmt = db.prepare(`
    SELECT * FROM cases
    WHERE type = ? AND created_at >= ?
    ORDER BY created_at DESC
  `);
  const candidates = stmt.all(type, cutoffTime).map(formatCaseRow);

  for (const c of candidates) {
    // Check location match
    let isLocMatch = false;

    if (locationText && c.location_text) {
      const locA = locationText.toLowerCase();
      const locB = c.location_text.toLowerCase();
      if (locA !== 'unknown' && locB !== 'unknown' && (locA.includes(locB) || locB.includes(locA))) {
        isLocMatch = true;
      }
    }

    if (!isLocMatch && lat != null && lng != null && c.lat != null && c.lng != null) {
      // Basic distance check (approx within ~5km)
      const dist = Math.sqrt(Math.pow(lat - c.lat, 2) + Math.pow(lng - c.lng, 2));
      if (dist < 0.05) { // ~5km
        isLocMatch = true;
      }
    }

    if (isLocMatch) {
      return c;
    }
  }

  return null;
}

function resetDb() {
  db.exec('DELETE FROM cases');
}

module.exports = {
  db,
  createCase,
  updateCase,
  getCaseById,
  getAllCases,
  findMatchingActiveCase,
  resetDb
};

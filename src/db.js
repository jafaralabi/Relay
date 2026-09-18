const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'relay.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Signal',
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    urgency TEXT NOT NULL,
    confidence_score REAL DEFAULT 0,
    responsible_actor TEXT,
    sla TEXT,
    acknowledged_at TEXT,
    lat REAL DEFAULT NULL,
    lng REAL DEFAULT NULL,
    location_text TEXT DEFAULT NULL,
    transcript TEXT DEFAULT NULL,
    evidence TEXT DEFAULT '[]',
    independent_verification TEXT DEFAULT NULL,
    history TEXT DEFAULT '[]',
    raw_report TEXT NOT NULL,
    classified_by TEXT DEFAULT 'Groq (Llama 3.3 70B)',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Migration support for existing database files missing new columns
const columns = db.pragma('table_info(cases)').map(c => c.name);
const neededCols = [
  { name: 'lat', type: 'REAL DEFAULT NULL' },
  { name: 'lng', type: 'REAL DEFAULT NULL' },
  { name: 'location_text', type: 'TEXT DEFAULT NULL' },
  { name: 'transcript', type: 'TEXT DEFAULT NULL' },
  { name: 'history', type: "TEXT DEFAULT '[]'" },
  { name: 'raw_report', type: "TEXT DEFAULT ''" },
  { name: 'classified_by', type: "TEXT DEFAULT 'Groq (Llama 3.3 70B)'" }
];
for (const col of neededCols) {
  if (!columns.includes(col.name)) {
    db.exec(`ALTER TABLE cases ADD COLUMN ${col.name} ${col.type}`);
  }
}

function generateCaseId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `RLA-${num}`;
}

/**
 * Format a database row into a JS case object matching schema.
 */
function rowToCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    type: row.type,
    severity: row.severity,
    urgency: row.urgency,
    confidence_score: Number(row.confidence_score || 0),
    responsible_actor: row.responsible_actor || null,
    sla: row.sla || null,
    acknowledged_at: row.acknowledged_at || null,
    lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
    lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : null,
    location_text: row.location_text || null,
    transcript: row.transcript || null,
    evidence: JSON.parse(row.evidence || '[]'),
    independent_verification: row.independent_verification ? JSON.parse(row.independent_verification) : null,
    history: JSON.parse(row.history || '[]'),
    raw_report: row.raw_report || '',
    classified_by: row.classified_by || 'Groq (Llama 3.3 70B)',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Create a new case record. Starts at status 'Signal'.
 */
function createCase(caseData) {
  const id = caseData.id || generateCaseId();
  const now = new Date().toISOString();

  const caseRecord = {
    id,
    status: caseData.status || 'Signal',
    type: caseData.type || 'Safety',
    severity: caseData.severity || 'Medium',
    urgency: caseData.urgency || 'Medium',
    confidence_score: caseData.confidence_score !== undefined ? caseData.confidence_score : 50,
    responsible_actor: caseData.responsible_actor || null,
    sla: caseData.sla || null,
    acknowledged_at: caseData.acknowledged_at || null,
    lat: caseData.lat !== undefined ? caseData.lat : null,
    lng: caseData.lng !== undefined ? caseData.lng : null,
    location_text: caseData.location_text || null,
    transcript: caseData.transcript || null,
    evidence: Array.isArray(caseData.evidence) ? caseData.evidence : (caseData.raw_report ? [caseData.raw_report] : []),
    independent_verification: caseData.independent_verification || null,
    history: Array.isArray(caseData.history) ? caseData.history : [],
    raw_report: caseData.raw_report || '',
    classified_by: caseData.classified_by || 'Groq (Llama 3.3 70B)',
    created_at: caseData.created_at || now,
    updated_at: caseData.updated_at || now
  };

  const stmt = db.prepare(`
    INSERT INTO cases (
      id, status, type, severity, urgency, confidence_score,
      responsible_actor, sla, acknowledged_at, lat, lng,
      location_text, transcript, evidence, independent_verification,
      history, raw_report, classified_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  stmt.run(
    caseRecord.id,
    caseRecord.status,
    caseRecord.type,
    caseRecord.severity,
    caseRecord.urgency,
    caseRecord.confidence_score,
    caseRecord.responsible_actor,
    caseRecord.sla,
    caseRecord.acknowledged_at,
    caseRecord.lat,
    caseRecord.lng,
    caseRecord.location_text,
    caseRecord.transcript,
    JSON.stringify(caseRecord.evidence),
    caseRecord.independent_verification ? JSON.stringify(caseRecord.independent_verification) : null,
    JSON.stringify(caseRecord.history),
    caseRecord.raw_report,
    caseRecord.classified_by,
    caseRecord.created_at,
    caseRecord.updated_at
  );

  return caseRecord;
}

/**
 * Update an existing case record.
 */
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
      raw_report = ?,
      classified_by = ?,
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
    updated.raw_report,
    updated.classified_by,
    updated.updated_at,
    id
  );

  return getCaseById(id);
}

/**
 * Get a case by ID.
 */
function getCaseById(id) {
  const stmt = db.prepare('SELECT * FROM cases WHERE id = ?');
  const row = stmt.get(id);
  return rowToCase(row);
}

/**
 * List all cases, ordered by created_at DESC.
 */
function getAllCases() {
  const stmt = db.prepare('SELECT * FROM cases ORDER BY created_at DESC');
  const rows = stmt.all();
  return rows.map(rowToCase);
}

/**
 * Search for an active case of same type and location created within time window.
 */
function findMatchingActiveCase(type, locationText, lat, lng, timeWindowMinutes = 60) {
  const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
  const stmt = db.prepare(`
    SELECT * FROM cases
    WHERE type = ? AND created_at >= ?
    ORDER BY created_at DESC
  `);
  const candidates = stmt.all(type, cutoffTime).map(rowToCase);

  for (const c of candidates) {
    let isLocMatch = false;

    if (locationText && c.location_text) {
      const locA = locationText.toLowerCase();
      const locB = c.location_text.toLowerCase();
      if (locA !== 'unknown' && locB !== 'unknown' && (locA.includes(locB) || locB.includes(locA))) {
        isLocMatch = true;
      }
    }

    if (!isLocMatch && lat != null && lng != null && c.lat != null && c.lng != null) {
      const dist = Math.sqrt(Math.pow(lat - c.lat, 2) + Math.pow(lng - c.lng, 2));
      if (dist < 0.05) {
        isLocMatch = true;
      }
    }

    if (isLocMatch) {
      return c;
    }
  }

  return null;
}

/**
 * Clear all cases (useful for tests).
 */
function clearCases() {
  db.prepare('DELETE FROM cases').run();
}

module.exports = {
  db,
  createCase,
  updateCase,
  getCaseById,
  getAllCases,
  findMatchingActiveCase,
  clearCases,
  resetDb: clearCases
};

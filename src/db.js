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
    evidence TEXT DEFAULT '[]',
    independent_verification TEXT DEFAULT NULL,
    raw_report TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Add missing columns dynamically if migrating
const existingColumns = db.prepare("PRAGMA table_info(cases)").all().map(col => col.name);
const newColumns = [
  { name: 'lat', type: 'REAL DEFAULT NULL' },
  { name: 'lng', type: 'REAL DEFAULT NULL' },
  { name: 'location_text', type: 'TEXT DEFAULT NULL' },
  { name: 'transcript', type: 'TEXT DEFAULT NULL' },
  { name: 'classified_by', type: "TEXT DEFAULT 'llm'" },
  { name: 'history', type: "TEXT DEFAULT '[]'" }
];

for (const col of newColumns) {
  if (!existingColumns.includes(col.name)) {
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
    confidence_score: row.confidence_score,
    responsible_actor: row.responsible_actor,
    sla: row.sla,
    acknowledged_at: row.acknowledged_at,
    evidence: JSON.parse(row.evidence || '[]'),
    independent_verification: row.independent_verification ? JSON.parse(row.independent_verification) : null,
    raw_report: row.raw_report,
    lat: row.lat !== undefined ? row.lat : null,
    lng: row.lng !== undefined ? row.lng : null,
    location_text: row.location_text || null,
    transcript: row.transcript || null,
    classified_by: row.classified_by || 'llm',
    history: row.history ? JSON.parse(row.history) : [],
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

  const initialStatus = caseData.status || 'Signal';
  const initialHistory = caseData.history || [
    { status: initialStatus, at: now, note: 'Initial report received' }
  ];

  const caseRecord = {
    id,
    status: initialStatus,
    type: caseData.type || 'Safety',
    severity: caseData.severity || 'Medium',
    urgency: caseData.urgency || 'Medium',
    confidence_score: caseData.confidence_score !== undefined ? caseData.confidence_score : 50,
    responsible_actor: caseData.responsible_actor || 'Unassigned',
    sla: caseData.sla || '24 hours',
    acknowledged_at: caseData.acknowledged_at || null,
    evidence: Array.isArray(caseData.evidence) ? caseData.evidence : (caseData.raw_report ? [caseData.raw_report] : []),
    independent_verification: caseData.independent_verification || null,
    raw_report: caseData.raw_report || '',
    lat: caseData.lat !== undefined ? caseData.lat : null,
    lng: caseData.lng !== undefined ? caseData.lng : null,
    location_text: caseData.location_text || null,
    transcript: caseData.transcript || null,
    classified_by: caseData.classified_by || 'llm',
    history: initialHistory,
    created_at: now,
    updated_at: now
  };

  const stmt = db.prepare(`
    INSERT INTO cases (
      id, status, type, severity, urgency, confidence_score,
      responsible_actor, sla, acknowledged_at, evidence,
      independent_verification, raw_report, lat, lng, location_text,
      transcript, classified_by, history, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
    JSON.stringify(caseRecord.evidence),
    caseRecord.independent_verification ? JSON.stringify(caseRecord.independent_verification) : null,
    caseRecord.raw_report,
    caseRecord.lat,
    caseRecord.lng,
    caseRecord.location_text,
    caseRecord.transcript,
    caseRecord.classified_by,
    JSON.stringify(caseRecord.history),
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

  const now = new Date().toISOString();
  const updatedRecord = {
    ...existing,
    ...caseData,
    updated_at: now
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
      evidence = ?,
      independent_verification = ?,
      raw_report = ?,
      lat = ?,
      lng = ?,
      location_text = ?,
      transcript = ?,
      classified_by = ?,
      history = ?,
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updatedRecord.status,
    updatedRecord.type,
    updatedRecord.severity,
    updatedRecord.urgency,
    updatedRecord.confidence_score,
    updatedRecord.responsible_actor,
    updatedRecord.sla,
    updatedRecord.acknowledged_at,
    JSON.stringify(updatedRecord.evidence),
    updatedRecord.independent_verification ? JSON.stringify(updatedRecord.independent_verification) : null,
    updatedRecord.raw_report,
    updatedRecord.lat,
    updatedRecord.lng,
    updatedRecord.location_text,
    updatedRecord.transcript,
    updatedRecord.classified_by,
    JSON.stringify(updatedRecord.history),
    updatedRecord.updated_at,
    id
  );

  return updatedRecord;
}

/**
 * Find an active case within a time window matching type and location.
 */
function findMatchingCase(type, locationText, lat, lng, timeWindowMinutes = 60) {
  const all = getAllCases();
  const now = new Date();

  return all.find(c => {
    if (c.type !== type) return false;

    const createdAt = new Date(c.created_at);
    const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
    if (diffMinutes > timeWindowMinutes) return false;

    if (locationText && c.location_text) {
      const loc1 = locationText.toLowerCase();
      const loc2 = c.location_text.toLowerCase();
      if (loc1.includes(loc2) || loc2.includes(loc1)) return true;
    }

    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined && c.lat !== null && c.lng !== null) {
      const dLat = Math.abs(c.lat - lat);
      const dLng = Math.abs(c.lng - lng);
      if (dLat < 0.05 && dLng < 0.05) return true;
    }

    return false;
  });
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
 * Clear all cases (useful for tests).
 */
function clearCases() {
  db.prepare('DELETE FROM cases').run();
}

module.exports = {
  db,
  createCase,
  updateCase,
  findMatchingCase,
  getCaseById,
  getAllCases,
  clearCases
};

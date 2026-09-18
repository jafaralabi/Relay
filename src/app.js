const express = require('express');
const { classifyReport } = require('./classifier');
const { createCase, getAllCases, getCaseById } = require('./db');
const whatsappRouter = require('./whatsapp');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount WhatsApp webhook routes (/webhook)
app.use('/', whatsappRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Relay Intake & Classification API' });
});

// Endpoint: Ingest report text & classify
app.post('/api/reports', async (req, res) => {
  try {
    const reportText = req.body.text || req.body.report;
    if (!reportText || typeof reportText !== 'string' || !reportText.trim()) {
      return res.status(400).json({ error: 'Field "text" or "report" is required and must be a non-empty string.' });
    }

    // Perform classification via Claude / Fallback
    const classification = await classifyReport(reportText);

    // Build & persist case record starting at status 'Signal'
    const newCase = createCase({
      status: 'Signal',
      type: classification.type,
      severity: classification.severity,
      urgency: classification.urgency,
      confidence_score: classification.confidence_score,
      responsible_actor: classification.responsible_actor,
      sla: classification.sla,
      evidence: [reportText.trim()],
      raw_report: reportText.trim()
    });

    console.log(`[Ingest] Report intake successful. Created Case ${newCase.id} with status Signal.`);
    console.log(`[Classification] ${newCase.type} | Severity: ${newCase.severity} | Urgency: ${newCase.urgency} | Actor: ${newCase.responsible_actor}`);

    return res.status(201).json({
      success: true,
      case: newCase
    });
  } catch (err) {
    console.error('[Ingest Error]', err);
    return res.status(500).json({ error: 'Internal server error processing report.' });
  }
});

// Endpoint: Alias for POST /api/cases
app.post('/api/cases', async (req, res) => {
  return app._router.handle(req, res, () => {}, '/api/reports');
});

// Endpoint: List all cases
app.get('/api/cases', (req, res) => {
  try {
    const cases = getAllCases();
    return res.json({ count: cases.length, cases });
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

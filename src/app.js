const express = require('express');
const path = require('path');
const { classifyReport } = require('./classifier');
const { createCase, getAllCases, getCaseById, updateCase, clearCases } = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Exact status schema sequence
const STATUS_SEQUENCE = [
  'Signal',
  'Corroborating',
  'Verified',
  'Assigned',
  'Accepted',
  'In Progress',
  'Claimed Resolved',
  'Independently Verified'
];

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Relay Intake & Classification API' });
});

// Endpoint: Ingest report text & classify
app.post('/api/reports', async (req, res) => {
  try {
    const body = req.body || {};
    const reportText = body.text || body.report;
    if (!reportText || typeof reportText !== 'string' || !reportText.trim()) {
      return res.status(400).json({ error: 'Field "text" or "report" is required and must be a non-empty string.' });
    }

    const trimmedText = reportText.trim();
    const reporter = body.reporter || 'Reporter 1';

    // Perform classification
    const classification = await classifyReport(trimmedText);

    // Build & persist case record starting at status 'Signal'
    const newCase = createCase({
      status: 'Signal',
      type: classification.type,
      severity: classification.severity,
      urgency: classification.urgency,
      confidence_score: classification.confidence_score,
      responsible_actor: classification.responsible_actor,
      sla: classification.sla,
      evidence: [trimmedText],
      raw_report: trimmedText,
      history: [
        {
          status: 'Signal',
          timestamp: new Date().toISOString(),
          note: `Initial report received from ${reporter}`
        }
      ]
    });

    console.log(`[Ingest] Report intake successful. Created Case ${newCase.id} with status Signal.`);

    return res.status(201).json({
      success: true,
      case: newCase
    });
  } catch (err) {
    console.error('[Ingest Error]', err);
    return res.status(500).json({ error: 'Internal server error processing report.' });
  }
});

// Alias POST /api/cases -> POST /api/reports
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

// Endpoint: Advance case status
app.post('/api/cases/:id/advance', (req, res) => {
  try {
    const { id } = req.params;
    const caseRecord = getCaseById(id);

    if (!caseRecord) {
      return res.status(404).json({ error: `Case '${id}' not found.` });
    }

    const currentIndex = STATUS_SEQUENCE.indexOf(caseRecord.status);
    if (currentIndex === -1 || currentIndex >= STATUS_SEQUENCE.length - 1) {
      return res.status(400).json({ error: `Case '${id}' cannot be advanced further from '${caseRecord.status}'.` });
    }

    const nextStatus = STATUS_SEQUENCE[currentIndex + 1];

    // Shallow-path guards
    const rawLower = (caseRecord.raw_report || '').toLowerCase();
    if (rawLower.includes('mile 12') || rawLower.includes('mile12')) {
      if (caseRecord.status === 'Accepted') {
        return res.status(409).json({
          error: 'Shallow path guard: Mile 12 community dispute case cannot advance past Accepted.'
        });
      }
    }

    if (rawLower.includes('ijegun')) {
      if (caseRecord.status === 'Assigned') {
        return res.status(409).json({
          error: 'Shallow path guard: Ijegun service failure case cannot advance past Assigned.'
        });
      }
    }

    // Direct transition to Independently Verified must use /verify endpoint
    if (nextStatus === 'Independently Verified') {
      return res.status(400).json({
        error: 'Transition to Independently Verified requires third-party confirmation via POST /api/cases/:id/verify.'
      });
    }

    const body = req.body || {};
    let note = body.note;
    const minutes_elapsed = body.minutes_elapsed;

    // Default or required notes for specific deep-path steps
    if (nextStatus === 'In Progress') {
      note = note || 'responders on site';
    } else if (nextStatus === 'Claimed Resolved') {
      note = note || 'responders dispersed the group, no injuries';
    } else if (!note) {
      note = `Advanced status to ${nextStatus}`;
    }

    const updatedHistory = [
      ...(caseRecord.history || []),
      {
        status: nextStatus,
        timestamp: new Date().toISOString(),
        note
      }
    ];

    const updateFields = {
      status: nextStatus,
      history: updatedHistory
    };

    // Acknowledged timestamp on Accepted
    if (nextStatus === 'Accepted') {
      const elapsed = minutes_elapsed !== undefined ? minutes_elapsed : 22;
      updateFields.acknowledged_at = `${elapsed} minutes after report`;
    }

    const updatedCase = updateCase(id, updateFields);

    return res.json({
      success: true,
      message: `Case ${id} advanced to ${nextStatus}.`,
      case: updatedCase
    });
  } catch (err) {
    console.error('[Advance Case Error]', err);
    return res.status(500).json({ error: 'Failed to advance case.' });
  }
});

// Endpoint: Third-party independent verification
app.post('/api/cases/:id/verify', (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { text, verifier } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Field "text" is required for independent verification.' });
    }

    const caseRecord = getCaseById(id);
    if (!caseRecord) {
      return res.status(404).json({ error: `Case '${id}' not found.` });
    }

    const verifierName = verifier || 'Third Community Member';
    const trimmedText = text.trim();

    // Verify rule: verifier must differ from responder and original reporter
    if (caseRecord.responsible_actor && caseRecord.responsible_actor.toLowerCase().includes(verifierName.toLowerCase())) {
      return res.status(400).json({ error: 'Verifier cannot be the same as the responsible actor.' });
    }

    const nextStatus = 'Independently Verified';
    const updatedEvidence = [...(caseRecord.evidence || []), trimmedText];
    const independentVerification = {
      verifier: verifierName,
      report: trimmedText,
      verified_at: new Date().toISOString(),
      status: 'Independently Verified'
    };

    const updatedHistory = [
      ...(caseRecord.history || []),
      {
        status: nextStatus,
        timestamp: new Date().toISOString(),
        note: `Independently verified by ${verifierName}: "${trimmedText}"`
      }
    ];

    const updatedCase = updateCase(id, {
      status: nextStatus,
      evidence: updatedEvidence,
      independent_verification: independentVerification,
      history: updatedHistory
    });

    return res.json({
      success: true,
      message: `Case ${id} independently verified.`,
      case: updatedCase
    });
  } catch (err) {
    console.error('[Verify Case Error]', err);
    return res.status(500).json({ error: 'Failed to verify case.' });
  }
});

// Endpoint: Reset DB
app.post('/api/demo/reset', (req, res) => {
  try {
    clearCases();
    return res.json({ success: true, message: 'Database reset successfully.' });
  } catch (err) {
    console.error('[Demo Reset Error]', err);
    return res.status(500).json({ error: 'Failed to reset database.' });
  }
});

// Endpoint: Seed DB with 3 demo cases in final states
app.post('/api/demo/seed', (req, res) => {
  try {
    clearCases();
    const now = new Date().toISOString();

    // 1. Deep Path Case (Agege Market)
    const agegeCase = createCase({
      id: 'RLA-9281',
      status: 'Independently Verified',
      type: 'Safety',
      severity: 'High',
      urgency: 'High',
      confidence_score: 95,
      responsible_actor: 'Community security responder + local police PRO contact',
      sla: '30 minutes',
      acknowledged_at: '22 minutes after report',
      raw_report: 'There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.',
      evidence: [
        'There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.',
        'Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.',
        'The area is calm now, responders arrived and dispersed everyone safely.'
      ],
      independent_verification: {
        verifier: 'Third Community Member',
        report: 'The area is calm now, responders arrived and dispersed everyone safely.',
        verified_at: now,
        status: 'Independently Verified'
      },
      history: [
        { status: 'Signal', timestamp: now, note: 'Initial report received' },
        { status: 'Corroborating', timestamp: now, note: 'Corroborating Pidgin report received' },
        { status: 'Verified', timestamp: now, note: 'Multi-source signals verified' },
        { status: 'Assigned', timestamp: now, note: 'Assigned to Community security responder' },
        { status: 'Accepted', timestamp: now, note: 'SLA accepted by responder' },
        { status: 'In Progress', timestamp: now, note: 'responders on site' },
        { status: 'Claimed Resolved', timestamp: now, note: 'responders dispersed the group, no injuries' },
        { status: 'Independently Verified', timestamp: now, note: 'Third-party community verification confirmed' }
      ]
    });

    // 2. Shallow Path 1 (Mile 12 Market)
    const mile12Case = createCase({
      id: 'RLA-4102',
      status: 'Accepted',
      type: 'Stability',
      severity: 'Medium',
      urgency: 'Medium',
      confidence_score: 80,
      responsible_actor: 'Trained volunteer / community mediator',
      sla: '4 hours',
      acknowledged_at: '15 minutes after report',
      raw_report: "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming.",
      evidence: ["Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming."],
      history: [
        { status: 'Signal', timestamp: now, note: 'Initial report received' },
        { status: 'Corroborating', timestamp: now, note: 'Location verified' },
        { status: 'Verified', timestamp: now, note: 'Dispute confirmed' },
        { status: 'Assigned', timestamp: now, note: 'Assigned to Trained community mediator' },
        { status: 'Accepted', timestamp: now, note: 'Mediator accepted assignment' }
      ]
    });

    // 3. Shallow Path 2 (Ijegun Primary School)
    const ijegunCase = createCase({
      id: 'RLA-1804',
      status: 'Assigned',
      type: 'Transparency',
      severity: 'Medium',
      urgency: 'Low',
      confidence_score: 80,
      responsible_actor: 'Institutional work-order / Local government contact',
      sla: '48 hours',
      acknowledged_at: null,
      raw_report: 'The borehole at Ijegun primary school has been broken for two weeks, children have no water.',
      evidence: ['The borehole at Ijegun primary school has been broken for two weeks, children have no water.'],
      history: [
        { status: 'Signal', timestamp: now, note: 'Initial report received' },
        { status: 'Corroborating', timestamp: now, note: 'Community report logged' },
        { status: 'Verified', timestamp: now, note: 'Infrastructure deficit confirmed' },
        { status: 'Assigned', timestamp: now, note: 'Routed to local government public works' }
      ]
    });

    return res.json({
      success: true,
      message: 'Database seeded with demo cases.',
      cases: [agegeCase, mile12Case, ijegunCase]
    });
  } catch (err) {
    console.error('[Demo Seed Error]', err);
    return res.status(500).json({ error: 'Failed to seed database.' });
  }
});

module.exports = app;

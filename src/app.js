const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { processReport } = require('./pipeline');
const { transcribeAudio } = require('./classifier');
const { getAllCases, getCaseById, clearCases } = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets if public directory exists
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Relay Intake & Classification API' });
});

// Endpoint: Ingest text report & process through pipeline
app.post('/api/reports', async (req, res) => {
  try {
    const reportText = req.body.text || req.body.report;
    if (!reportText || typeof reportText !== 'string' || !reportText.trim()) {
      return res.status(400).json({ error: 'Field "text" or "report" is required and must be a non-empty string.' });
    }

    const caseRecord = await processReport({
      text: reportText.trim(),
      lat: req.body.lat,
      lng: req.body.lng,
      reporter: req.body.reporter || 'Anonymous'
    });

    return res.status(201).json({
      success: true,
      case: caseRecord
    });
  } catch (err) {
    console.error('[Ingest Error]', err);
    return res.status(500).json({ error: 'Internal server error processing report.' });
  }
});

// Endpoint: Ingest voice audio report
app.post('/api/reports/voice', upload.single('audio'), async (req, res) => {
  try {
    let file = req.file;
    if (!file && req.files) {
      file = req.files.audio || req.files.file;
    }

    if (!file && req.body && req.body.audio) {
      const base64Data = req.body.audio.replace(/^data:audio\/\w+;base64,/, '');
      file = {
        buffer: Buffer.from(base64Data, 'base64'),
        mimetype: 'audio/wav',
        originalname: 'voice.wav'
      };
    }

    let transcript = req.body.transcript;
    if (!transcript) {
      if (!file) {
        return res.status(400).json({ error: 'Audio file or transcript is required.' });
      }
      const mimeType = file.mimetype || 'audio/wav';
      const filename = file.originalname || 'voice.wav';
      transcript = await transcribeAudio(file.buffer, mimeType, filename);
    }

    const caseRecord = await processReport({
      text: transcript,
      lat: req.body.lat,
      lng: req.body.lng,
      reporter: req.body.reporter || 'Voice Reporter',
      isVoice: true,
      transcript
    });

    return res.status(201).json({
      success: true,
      case: caseRecord
    });
  } catch (err) {
    console.error('[Voice Ingest Error]', err);
    return res.status(500).json({ error: err.message || 'Internal server error processing voice report.' });
  }
});

// Endpoint: Alias for POST /api/cases
app.post('/api/cases', async (req, res, next) => {
  req.url = '/api/reports';
  return app._router.handle(req, res, next);
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

// Endpoint: Reset database (useful for test suites)
app.post('/api/reset', (req, res) => {
  try {
    clearCases();
    return res.json({ message: 'Database reset successful' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset database' });
  }
});

module.exports = app;

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { getAllCases, getCaseById, resetDb } = require('./db');
const { processReport } = require('./pipeline');
const { transcribeAudio } = require('./groq');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets if public directory exists
const path = require('path');
const publicDir = path.join(__dirname, '..', 'public');
const fs = require('fs');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// API Routes

// POST /api/reports - Ingest text report
app.post('/api/reports', async (req, res) => {
  try {
    const { text, lat, lng, reporter } = req.body;
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'Field "text" is required.' });
    }

    const caseRecord = await processReport({ text: text.trim(), lat, lng, reporter });
    return res.status(201).json({ case: caseRecord });
  } catch (err) {
    console.error('Error processing text report:', err);
    return res.status(500).json({ error: err.message || 'Failed to process report' });
  }
});

// POST /api/reports/voice - Ingest voice audio report
app.post('/api/reports/voice', upload.single('audio'), async (req, res) => {
  try {
    // Support file field named 'audio' or fallback to 'file'
    let file = req.file;
    if (!file && req.files) {
      file = req.files.audio || req.files.file;
    }

    if (!file && req.body && req.body.audio) {
      // If base64 audio string was sent in body
      const base64Data = req.body.audio.replace(/^data:audio\/\w+;base64,/, '');
      file = {
        buffer: Buffer.from(base64Data, 'base64'),
        mimetype: 'audio/wav',
        originalname: 'voice.wav'
      };
    }

    if (!file) {
      return res.status(400).json({ error: 'Audio file is required in multipart field "audio" or "file".' });
    }

    const mimeType = file.mimetype || 'audio/wav';
    const filename = file.originalname || 'voice.wav';

    let transcript = req.body.transcript;
    if (!transcript) {
      transcript = await transcribeAudio(file.buffer, mimeType, filename);
    }

    const lat = req.body.lat;
    const lng = req.body.lng;
    const reporter = req.body.reporter || 'Voice Reporter';

    const caseRecord = await processReport({
      text: transcript,
      lat,
      lng,
      reporter,
      isVoice: true,
      transcript
    });

    return res.status(201).json({ case: caseRecord });
  } catch (err) {
    console.error('Error processing voice report:', err);
    return res.status(500).json({ error: err.message || 'Failed to process voice report' });
  }
});

// GET /api/cases - List all cases
app.get('/api/cases', (req, res) => {
  try {
    const cases = getAllCases();
    return res.json({ cases });
  } catch (err) {
    console.error('Error getting cases:', err);
    return res.status(500).json({ error: 'Failed to retrieve cases' });
  }
});

// GET /api/cases/:id - Get specific case by ID
app.get('/api/cases/:id', (req, res) => {
  try {
    const caseRecord = getCaseById(req.params.id);
    if (!caseRecord) {
      return res.status(404).json({ error: 'Case not found' });
    }
    return res.json({ case: caseRecord });
  } catch (err) {
    console.error(`Error getting case ${req.params.id}:`, err);
    return res.status(500).json({ error: 'Failed to retrieve case' });
  }
});

// POST /api/reset - Reset database (useful for testing/demo resets)
app.post('/api/reset', (req, res) => {
  try {
    resetDb();
    return res.json({ message: 'Database reset successful' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset database' });
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Relay backend running on port ${PORT}`);
  });
}

module.exports = app;

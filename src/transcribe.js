require('dotenv').config();

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

const DEFAULT_WHISPER_PROMPT = 'Nigerian Pidgin English. Common words: wetin, dey, na, di, wey, comot, abeg, pikin, oga, no wahala. Lagos places: Agege market, Mile 12 market, Ijegun, Oshodi, Ikorodu.';

async function singleTranscribeCall(audioBuffer, filename, mimetype) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY missing in environment.');
  }

  const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3';
  const prompt = process.env.WHISPER_PROMPT || DEFAULT_WHISPER_PROMPT;

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimetype || 'audio/mp3' });
  formData.append('file', blob, filename || 'voice_report.mp3');
  formData.append('model', model);
  formData.append('temperature', '0');
  formData.append('language', 'en');
  formData.append('prompt', prompt);

  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq Whisper API status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!data || !data.text || !data.text.trim()) {
    throw new Error('Groq Whisper API returned empty transcription text.');
  }

  return data.text.trim();
}

/**
 * Transcribe audio with retry once on empty/failure.
 * Returns { text, transcribedBy } or throws Error.
 */
async function transcribeAudio(audioBuffer, filename = 'voice_report.mp3', mimetype = 'audio/mp3') {
  const demoMode = process.env.DEMO_MODE === 'true';

  let lastError = null;
  // Retry once (2 attempts total)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await singleTranscribeCall(audioBuffer, filename, mimetype);
      if (text) {
        return { text, transcribedBy: 'whisper' };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Voice Transcribe] Attempt ${attempt} failed: ${err.message}`);
    }
  }

  if (demoMode) {
    console.warn('[Voice Transcribe] DEMO_MODE=true enabled. Falling back to mock transcription.');
    return {
      text: "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.",
      transcribedBy: 'mock'
    };
  }

  throw new Error(lastError ? lastError.message : 'Transcription failed after retry.');
}

module.exports = {
  transcribeAudio
};

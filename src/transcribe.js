require('dotenv').config();

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

/**
 * Transcribe an audio file buffer using Groq Whisper Large V3 API.
 * @param {Buffer} audioBuffer Buffer of the audio file
 * @param {string} filename File name or fallback
 * @param {string} mimetype MIME type of the audio file
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioBuffer, filename = 'voice_report.mp3', mimetype = 'audio/mp3') {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn('[Voice Transcribe] GROQ_API_KEY not found. Using fallback mock transcription.');
    return "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
  }

  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimetype || 'audio/mp3' });
    formData.append('file', blob, filename || 'voice_report.mp3');
    formData.append('model', WHISPER_MODEL);

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq Whisper API error (status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data || !data.text) {
      throw new Error('Groq Whisper API returned empty transcription text.');
    }

    return data.text.trim();
  } catch (err) {
    console.error('[Voice Transcribe Error]', err.message);
    console.warn('[Voice Transcribe] Falling back to default mock transcription.');
    return "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
  }
}

module.exports = {
  transcribeAudio
};

require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = `You are an expert civic intelligence and security report classifier for Relay, a peace-tech innovation system.
Analyze incoming incident reports (which may be in English, Nigerian Pidgin, or a mixture) and output a JSON object with EXACTLY the following fields:

1. "type": Must be one of ["Safety", "Stability", "Transparency"].
   - "Safety": Physical violence, armed threat, crime, imminent bodily harm, active danger.
   - "Stability": Disputes, land/market conflicts, civil unrest, community tension.
   - "Transparency": Service failures, broken infrastructure, corruption, institutional negligence.
2. "severity": Must be one of ["High", "Medium", "Low"].
3. "urgency": Must be one of ["High", "Medium", "Low"].
4. "responsible_actor": A concise description of the actor class or agency that owns the resolution (e.g., "Community security responder + local police PRO contact", "Trained community mediator", "Local government works officer").
5. "sla": Target timeframe (e.g., "30 minutes", "24 hours", "72 hours").
6. "confidence_score": Integer between 0 and 100 representing classification confidence.
7. "location_text": String extracted from the text (e.g., "Agege market", "Mile 12 market", "Ijegun primary school"). If not specified, return "Unknown".
8. "summary": A concise English summary of the report.

CRITICAL: Return ONLY valid JSON with no markdown formatting or triple backticks.`;

/**
 * Heuristic fallback classifier in case GROQ_API_KEY is missing or API call fails.
 */
function fallbackClassify(text) {
  const lower = text.toLowerCase();
  let location_text = 'Unknown';

  if (lower.includes('agege')) location_text = 'Agege market';
  else if (lower.includes('mile 12') || lower.includes('mile12')) location_text = 'Mile 12 market';
  else if (lower.includes('ijegun')) location_text = 'Ijegun primary school';

  if (lower.includes('armed') || lower.includes('weapon') || lower.includes('scared') || lower.includes('men gathering') || lower.includes('weapon dey near')) {
    return {
      type: 'Safety',
      severity: 'High',
      urgency: 'High',
      responsible_actor: 'Community Security Responder + Local Police PRO Contact',
      sla: '30 minutes',
      confidence_score: 85,
      location_text,
      summary: text
    };
  }

  if (lower.includes('fight') || lower.includes('dispute') || lower.includes('stall') || lower.includes('traders') || lower.includes('crowd')) {
    return {
      type: 'Stability',
      severity: 'Medium',
      urgency: 'Medium',
      responsible_actor: 'Trained Community Mediator',
      sla: '24 hours',
      confidence_score: 80,
      location_text,
      summary: text
    };
  }

  if (lower.includes('water') || lower.includes('borehole') || lower.includes('broken') || lower.includes('school') || lower.includes('road')) {
    return {
      type: 'Transparency',
      severity: 'Medium',
      urgency: 'Medium',
      responsible_actor: 'Local Government Works Officer',
      sla: '72 hours',
      confidence_score: 80,
      location_text,
      summary: text
    };
  }

  return {
    type: 'Safety',
    severity: 'Medium',
    urgency: 'Medium',
    responsible_actor: 'Local community desk',
    sla: '24 hours',
    confidence_score: 60,
    location_text,
    summary: text
  };
}

/**
 * Classify a text report using Groq Llama 3.3 70B API (with fallback).
 * @param {string} text Report text input
 * @returns {Promise<Object>} Classification result
 */
async function classifyReport(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Report text cannot be empty.');
  }

  if (!GROQ_API_KEY) {
    console.warn('[Classifier] GROQ_API_KEY not found in environment. Using fallback classification.');
    return fallbackClassify(text);
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Classify this incident report:\n\n"${text.trim()}"` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Classifier] Groq API Error:', errText);
      return fallbackClassify(text);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    let jsonStr = content ? content.trim() : '';

    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const result = JSON.parse(jsonStr);

    return {
      type: result.type || 'Safety',
      severity: result.severity || 'Medium',
      urgency: result.urgency || 'Medium',
      responsible_actor: result.responsible_actor || 'Local community responder',
      sla: result.sla || '24 hours',
      confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : 80,
      location_text: result.location_text || 'Unknown',
      summary: result.summary || text
    };
  } catch (err) {
    console.error('[Classifier] Error during Groq API classification:', err.message);
    return fallbackClassify(text);
  }
}

/**
 * Transcribe an audio recording using Groq Whisper Large V3 API.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @param {string} filename
 * @returns {Promise<string>}
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/wav', filename = 'recording.wav') {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required for audio transcription.');
  }

  const blob = new Blob([audioBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-large-v3');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq Whisper API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (err) {
    console.error('[Classifier] Error during Groq Whisper transcription:', err.message);
    throw err;
  }
}

module.exports = {
  classifyReport,
  fallbackClassify,
  transcribeAudio
};

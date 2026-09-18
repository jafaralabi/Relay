require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function classifyReport(reportText) {
  if (!reportText || typeof reportText !== 'string') {
    throw new Error('Report text is required');
  }

  if (!GROQ_API_KEY) {
    console.warn('GROQ_API_KEY not found in environment. Using heuristic fallback classification.');
    return fallbackClassify(reportText);
  }

  const systemPrompt = `You are an AI classifier for Relay, a peace tech innovation system.
Classify the given incident report, which may be in English, Nigerian Pidgin, or a mixture.

Return a JSON object with EXACTLY these keys:
- "type": "Safety" | "Stability" | "Transparency"
    * "Safety": Threats, armed groups, violence, security dangers, weapons, crime.
    * "Stability": Market disputes, stall fights, land disputes, community quarrels.
    * "Transparency": Infrastructure failures, broken public services (boreholes, water, roads, schools), corruption.
- "severity": "High" | "Medium" | "Low"
- "urgency": "High" | "Medium" | "Low"
- "location_text": String extracted from the text (e.g., "Agege market", "Mile 12 market", "Ijegun primary school"). If not specified, return "Unknown".
- "summary": A concise English summary of the report.

CRITICAL: Return ONLY valid raw JSON with no markdown formatting or triple backticks.`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: reportText }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq Classification API Error:', errText);
      return fallbackClassify(reportText);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    return {
      type: parsed.type || 'Safety',
      severity: parsed.severity || 'Medium',
      urgency: parsed.urgency || 'Medium',
      location_text: parsed.location_text || 'Unknown',
      summary: parsed.summary || reportText
    };
  } catch (err) {
    console.error('Error during Groq classification:', err);
    return fallbackClassify(reportText);
  }
}

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
    console.error('Error during Groq Whisper transcription:', err);
    throw err;
  }
}

function fallbackClassify(text) {
  const lower = text.toLowerCase();
  let type = 'Safety';
  let severity = 'Medium';
  let urgency = 'Medium';
  let location_text = 'Unknown';

  if (lower.includes('agege')) location_text = 'Agege market';
  else if (lower.includes('mile 12') || lower.includes('mile12')) location_text = 'Mile 12 market';
  else if (lower.includes('ijegun')) location_text = 'Ijegun primary school';

  if (lower.includes('armed') || lower.includes('weapon') || lower.includes('scared') || lower.includes('threat')) {
    type = 'Safety';
    severity = 'High';
    urgency = 'High';
  } else if (lower.includes('fighting') || lower.includes('dispute') || lower.includes('stall') || lower.includes('traders')) {
    type = 'Stability';
    severity = 'Medium';
    urgency = 'Medium';
  } else if (lower.includes('borehole') || lower.includes('water') || lower.includes('broken') || lower.includes('school')) {
    type = 'Transparency';
    severity = 'Medium';
    urgency = 'Medium';
  }

  return {
    type,
    severity,
    urgency,
    location_text,
    summary: text
  };
}

module.exports = {
  classifyReport,
  transcribeAudio
};

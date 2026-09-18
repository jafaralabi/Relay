require('dotenv').config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are an expert civic intelligence and security report classifier for Relay, a peace-tech innovation system.
Analyze incoming incident reports and output a JSON object with the following fields:
1. "type": Must be one of ["Safety", "Stability", "Transparency"].
   - "Safety": Physical violence, armed threat, crime, imminent bodily harm, active danger.
   - "Stability": Disputes, land/market conflicts, civil unrest, community tension.
   - "Transparency": Service failures, broken infrastructure, corruption, institutional negligence.
2. "severity": Must be one of ["High", "Medium", "Low"].
3. "urgency": Must be one of ["High", "Medium", "Low"].
4. "responsible_actor": A concise description of the actor class or agency that owns the resolution (e.g., "Community security responder + local police PRO contact", "Trained community mediator", "Local government public works").
5. "sla": Target timeframe (e.g., "30 minutes", "2 hours", "24 hours", "48 hours").
6. "confidence_score": Integer between 0 and 100 representing classification confidence based on report clarity and detail.

Respond ONLY with valid JSON. Do not wrap in backticks or markdown formatting.`;

/**
 * Heuristic fallback classifier in case API key is missing or API call fails.
 */
function fallbackClassify(text) {
  const lower = text.toLowerCase();

  if (lower.includes('armed') || lower.includes('gun') || lower.includes('weapon') || lower.includes('danger') || lower.includes('kill') || lower.includes('scared') || lower.includes('men gathering')) {
    return {
      type: 'Safety',
      severity: 'High',
      urgency: 'High',
      responsible_actor: 'Community security responder + local police PRO contact',
      sla: '30 minutes',
      confidence_score: 85
    };
  }

  if (lower.includes('fight') || lower.includes('dispute') || lower.includes('stall') || lower.includes('crowd') || lower.includes('quarrel')) {
    return {
      type: 'Stability',
      severity: 'Medium',
      urgency: 'Medium',
      responsible_actor: 'Trained community mediator',
      sla: '4 hours',
      confidence_score: 80
    };
  }

  if (lower.includes('water') || lower.includes('borehole') || lower.includes('broken') || lower.includes('school') || lower.includes('road') || lower.includes('light')) {
    return {
      type: 'Transparency',
      severity: 'Medium',
      urgency: 'Low',
      responsible_actor: 'Institutional work-order / Local government contact',
      sla: '48 hours',
      confidence_score: 80
    };
  }

  return {
    type: 'Safety',
    severity: 'Medium',
    urgency: 'Medium',
    responsible_actor: 'Local community desk',
    sla: '24 hours',
    confidence_score: 60
  };
}

/**
 * Classify a text report using Groq API (openai/gpt-oss-120b, OpenAI-compatible format).
 * @param {string} text Report text input
 * @returns {Promise<Object>} Classification result
 */
async function classifyReport(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Report text cannot be empty.');
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn('[Classifier] GROQ_API_KEY not found in environment. Using rule-based fallback classification.');
    return fallbackClassify(text);
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Classify this incident report:\n\n"${text.trim()}"` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API responded with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const contentText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!contentText) {
      throw new Error('Empty message content in Groq API response.');
    }

    let jsonStr = contentText.trim();
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
      confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : 80
    };
  } catch (err) {
    console.error('[Classifier] Error during Groq API classification:', err.message);
    console.warn('[Classifier] Falling back to rule-based classification.');
    return fallbackClassify(text);
  }
}

module.exports = {
  classifyReport,
  fallbackClassify
};

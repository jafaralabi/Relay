require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Load actors config for consistent actor/SLA mapping
let actorsConfig = {};
try {
  const actorsPath = path.join(__dirname, '..', 'data', 'actors.json');
  if (fs.existsSync(actorsPath)) {
    actorsConfig = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));
  }
} catch (err) {
  console.warn('[Classifier] Could not load actors.json config:', err.message);
}

function getActorAndSla(type, severity) {
  if (actorsConfig[type] && actorsConfig[type][severity]) {
    return actorsConfig[type][severity];
  }
  return {
    responsible_actor: 'Local community desk officer',
    sla: '24 hours'
  };
}

const SYSTEM_PROMPT = `You are an expert civic intelligence and security report classifier for Relay, a peace-tech system in Nigeria.
Analyze incoming messages (written in English, Nigerian Pidgin, or local dialects) and return a JSON object with:

1. "is_incident": boolean. Set to true for incident reports, threats, disputes, service failures, or civic concerns. Set to false for general non-incident questions (e.g. "what time does the market open?"), greetings, or general queries.
2. "type": Must be one of ["Safety", "Stability", "Transparency"].
   - Safety: threat to people/physical security
   - Stability: disputes/tensions that could escalate
   - Transparency: service failures/accountability gaps
3. "severity": Must be one of ["High", "Medium", "Low"].
   - High: credible risk of serious harm or violence to people (weapons, injuries, panic, armed groups)
   - Medium: conflict or disruption that could escalate but with no weapons or injuries reported (a stall dispute, a crowd gathering, a broken public service)
   - Low: minor, routine, or informational
4. "urgency": Must be one of ["High", "Medium", "Low"].
   - High: imminent danger, act in minutes/hours
   - Medium: act within days (e.g., a two-week-old broken borehole is Medium urgency, not High)
   - Low: routine
5. "location_text": Extracted primary landmark, market, or neighborhood name mentioned in the text (e.g. "Agege market", "Mile 12 market", "Ijegun primary school"), or null if no location is mentioned.
6. "responsible_actor": Concise description of actor class that owns resolution.
7. "sla": Target timeframe (e.g. "30 minutes", "24 hours", "72 hours").
8. "confidence_score": Integer between 0 and 100 representing classification confidence based on report clarity and detail.

Respond ONLY with valid JSON matching these fields. Do not wrap in backticks or markdown formatting.`;

/**
 * Heuristic fallback classifier in case API key is missing or API call fails.
 */
function fallbackClassify(text, reason = 'API key missing or request failed') {
  console.warn(`[Classifier] FALLBACK USED: ${reason}`);

  const lower = text.toLowerCase();

  // Non-incident detection
  if (
    (lower.includes('what time') || lower.includes('when does') || lower.includes('how much') || lower.includes('hello') || lower.includes('hi ')) &&
    !lower.includes('armed') && !lower.includes('fight') && !lower.includes('broken') && !lower.includes('weapon') && !lower.includes('borehole')
  ) {
    return {
      is_incident: false,
      type: 'Transparency',
      severity: 'Low',
      urgency: 'Low',
      location_text: null,
      responsible_actor: 'Local community desk',
      sla: '24 hours',
      confidence_score: 90,
      classified_by: 'fallback'
    };
  }

  let locationText = null;
  if (lower.includes('agege')) locationText = 'Agege market';
  else if (lower.includes('mile 12') || lower.includes('mile12')) locationText = 'Mile 12 market';
  else if (lower.includes('ijegun')) locationText = 'Ijegun primary school';

  // Safety keywords checked with word boundaries to avoid false positives (e.g. "gun" in "Ijegun")
  const isSafety = /\b(armed|gun|guns|weapon|weapons|danger|kill|killed|killing|scared|men gathering|dey run comot)\b/i.test(lower);
  if (isSafety) {
    const actorSla = getActorAndSla('Safety', 'High');
    return {
      is_incident: true,
      type: 'Safety',
      severity: 'High',
      urgency: 'High',
      location_text: locationText || 'Agege market',
      responsible_actor: actorSla.responsible_actor,
      sla: actorSla.sla,
      confidence_score: 85,
      classified_by: 'fallback'
    };
  }

  // Stability
  const isStability = /\b(fight|fighting|dispute|stall|crowd|quarrel)\b/i.test(lower);
  if (isStability) {
    const actorSla = getActorAndSla('Stability', 'Medium');
    return {
      is_incident: true,
      type: 'Stability',
      severity: 'Medium',
      urgency: 'Medium',
      location_text: locationText || 'Mile 12 market',
      responsible_actor: actorSla.responsible_actor,
      sla: actorSla.sla,
      confidence_score: 80,
      classified_by: 'fallback'
    };
  }

  // Transparency
  const isTransparency = /\b(water|borehole|broken|school|road|light)\b/i.test(lower);
  if (isTransparency) {
    const actorSla = getActorAndSla('Transparency', 'Medium');
    return {
      is_incident: true,
      type: 'Transparency',
      severity: 'Medium',
      urgency: 'Medium',
      location_text: locationText || 'Ijegun primary school',
      responsible_actor: actorSla.responsible_actor,
      sla: actorSla.sla,
      confidence_score: 80,
      classified_by: 'fallback'
    };
  }

  const actorSla = getActorAndSla('Safety', 'Medium');
  return {
    is_incident: true,
    type: 'Safety',
    severity: 'Medium',
    urgency: 'Medium',
    location_text: locationText,
    responsible_actor: actorSla.responsible_actor,
    sla: actorSla.sla,
    confidence_score: 60,
    classified_by: 'fallback'
  };
}

/**
 * Classify a text report using Groq API (openai/gpt-oss-120b or process.env.GROQ_MODEL).
 * @param {string} text Report text input
 * @returns {Promise<Object>} Classification result
 */
async function classifyReport(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Report text cannot be empty.');
  }

  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  if (!apiKey) {
    return fallbackClassify(text, 'GROQ_API_KEY not found in environment');
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Classify this message:\n\n"${text.trim()}"` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API status ${response.status}: ${errText}`);
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

    const type = result.type || 'Safety';
    const severity = result.severity || 'Medium';
    const actorSla = getActorAndSla(type, severity);

    return {
      is_incident: result.is_incident !== undefined ? Boolean(result.is_incident) : true,
      type: type,
      severity: severity,
      urgency: result.urgency || (severity === 'High' ? 'High' : 'Medium'),
      location_text: result.location_text || null,
      responsible_actor: result.responsible_actor || actorSla.responsible_actor,
      sla: result.sla || actorSla.sla,
      confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : 80,
      classified_by: 'llm'
    };
  } catch (err) {
    return fallbackClassify(text, err.message);
  }
}

module.exports = {
  classifyReport,
  fallbackClassify
};

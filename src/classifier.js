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

// Load locations gazetteer for prompt canonical list and fallback checking
let locationsGazetteer = [];
try {
  const locPath = path.join(__dirname, '..', 'data', 'locations.json');
  if (fs.existsSync(locPath)) {
    locationsGazetteer = JSON.parse(fs.readFileSync(locPath, 'utf8'));
  }
} catch (err) {
  console.warn('[Classifier] Could not load locations.json config:', err.message);
}

const { fuzzyMatchLocation } = require('./location');

function getActorAndSla(type, severity) {
  if (actorsConfig[type] && actorsConfig[type][severity]) {
    return actorsConfig[type][severity];
  }
  return {
    responsible_actor: 'Local community desk officer',
    sla: '24 hours'
  };
}

const CANONICAL_LOCATIONS_LIST = locationsGazetteer.map(l => l.name).join(', ');

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
5. "location_text": Primary landmark, market, or neighborhood name mentioned in the text. Whenever possible, map recognized locations to one of these canonical names: [${CANONICAL_LOCATIONS_LIST}]. Set to null if no location is mentioned.
6. "responsible_actor": Concise description of actor class that owns resolution.
7. "sla": Target timeframe (e.g. "30 minutes", "24 hours", "72 hours").
8. "confidence_score": Integer between 0 and 100 representing classification confidence based on report clarity and detail.

Respond ONLY with valid JSON matching these fields. Do not wrap in backticks or markdown formatting.`;

/**
 * Heuristic fallback classifier in case API key is missing or all API attempts fail.
 * Set location_text only if a gazetteer entry matches the text; otherwise null.
 */
function fallbackClassify(text, reason = 'API key missing or request failed') {
  console.warn(`[Classifier] FALLBACK USED: ${reason}`);

  const lower = text.toLowerCase();

  // Match gazetteer entry or set location_text to null
  const matchedLoc = fuzzyMatchLocation(text, locationsGazetteer);
  const locationText = matchedLoc ? matchedLoc.name : null;

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

  // Safety keywords checked with word boundaries
  const isSafety = /\b(armed|gun|guns|weapon|weapons|danger|kill|killed|killing|scared|men gathering|dey run comot)\b/i.test(lower);
  if (isSafety) {
    const actorSla = getActorAndSla('Safety', 'High');
    return {
      is_incident: true,
      type: 'Safety',
      severity: 'High',
      urgency: 'High',
      location_text: locationText,
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
      location_text: locationText,
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
      location_text: locationText,
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
 * Helper to parse retry delay from HTTP 429 response message or headers.
 */
function parseRetryDelayMs(errText) {
  if (!errText) return 2000;
  const match = errText.match(/try again in ([0-9]+(\.[0-9]+)?)s/i) || errText.match(/please try again in ([0-9]+(\.[0-9]+)?)s/i);
  if (match && match[1]) {
    const seconds = parseFloat(match[1]);
    return Math.min(8000, Math.max(1000, Math.ceil(seconds * 1000)));
  }
  return 2000;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make an API completion call to Groq with rate-limit retry logic.
 */
async function callGroqModel(modelId, text, apiKey) {
  const isGptOss = modelId.includes('gpt-oss');
  const payload = {
    model: modelId,
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Classify this message:\n\n"${text.trim()}"` }
    ]
  };

  if (isGptOss) {
    payload.reasoning_effort = 'low';
  }

  let totalWaitMs = 0;
  const MAX_WAIT_MS = 8000;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[Classifier] model=${modelId} attempt=${attempt}`);
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      const contentText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!contentText) {
        throw new Error(`Empty content returned by model ${modelId}`);
      }
      return contentText;
    }

    const errText = await response.text();
    if (response.status === 429 && attempt < 3 && totalWaitMs < MAX_WAIT_MS) {
      const waitMs = parseRetryDelayMs(errText);
      if (totalWaitMs + waitMs <= MAX_WAIT_MS) {
        console.warn(`[Classifier] HTTP 429 rate limit hit for model ${modelId}. Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
        totalWaitMs += waitMs;
        continue;
      }
    }

    throw new Error(`Groq API status ${response.status} for model ${modelId}: ${errText}`);
  }
}

/**
 * Classify a text report using primary Groq API model, fallback models on 429/failure, and keyword fallback as last resort.
 * @param {string} text Report text input
 * @returns {Promise<Object>} Classification result
 */
async function classifyReport(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Report text cannot be empty.');
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return fallbackClassify(text, 'GROQ_API_KEY not found in environment');
  }

  const primaryModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const fallbackModelsEnv = process.env.GROQ_FALLBACK_MODELS || 'openai/gpt-oss-20b,qwen/qwen3.8-27b';
  const fallbackModels = fallbackModelsEnv.split(',').map(m => m.trim()).filter(Boolean);

  const candidateModels = [primaryModel, ...fallbackModels];
  let lastError = null;

  for (const modelId of candidateModels) {
    try {
      const contentText = await callGroqModel(modelId, text, apiKey);

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
        classified_by: modelId
      };
    } catch (err) {
      console.warn(`[Classifier] Model ${modelId} failed: ${err.message}`);
      lastError = err;
    }
  }

  return fallbackClassify(text, lastError ? lastError.message : 'All LLM models failed');
}

module.exports = {
  classifyReport,
  fallbackClassify
};

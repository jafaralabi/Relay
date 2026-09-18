const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

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
 * Classify a text report using Anthropic Claude API (with fallback).
 * @param {string} text Report text input
 * @returns {Promise<Object>} Classification result
 */
async function classifyReport(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Report text cannot be empty.');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('[Classifier] ANTHROPIC_API_KEY not found in environment. Using rule-based fallback classification.');
    return fallbackClassify(text);
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this incident report:\n\n"${text.trim()}"`
        }
      ]
    });

    const contentBlock = response.content && response.content[0];
    if (!contentBlock || !contentBlock.text) {
      throw new Error('Empty response from Claude API.');
    }

    let jsonStr = contentBlock.text.trim();
    // Remove markdown code fence if wrapped
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
    console.error('[Classifier] Error during Claude API classification:', err.message);
    console.warn('[Classifier] Falling back to rule-based classification.');
    return fallbackClassify(text);
  }
}

module.exports = {
  classifyReport,
  fallbackClassify
};

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set dummy API key so classifier attempts model call
process.env.GROQ_API_KEY = 'mock_groq_api_key_for_offline_test';
process.env.GROQ_MODEL = 'primary-mock-model';
process.env.GROQ_FALLBACK_MODELS = 'fallback-mock-model-1';
process.env.CLASSIFIER_PER_CALL_TIMEOUT_MS = '100';
process.env.CLASSIFIER_OVERALL_TIMEOUT_MS = '500';

const { classifyReport } = require('../src/classifier');

async function runClassifierTests() {
  console.log('====================================================');
  console.log('       OFFLINE CLASSIFIER TEST SUITE (NO NETWORK)');
  console.log('====================================================\n');

  const originalFetch = global.fetch;

  try {
    // --- Test (a) & (b): Returns actors.json actor/SLA and ignores model confidence_score ---
    console.log('Testing (a) & (b): Overrides actor/SLA from actors.json and ignores model confidence_score...');
    global.fetch = async (url, options) => {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                is_incident: true,
                type: 'Safety',
                severity: 'High',
                urgency: 'High',
                location_text: 'Agege market',
                responsible_actor: 'Armed Men Representative', // model bogus actor
                sla: '1 minute', // model bogus sla
                confidence_score: 100 // model score should be ignored
              })
            }
          }]
        })
      };
    };

    const resA = await classifyReport('Armed group near Agege market');
    assert.strictEqual(resA.responsible_actor, 'Community security responder + local police PRO contact');
    assert.strictEqual(resA.sla, '30 minutes');
    assert.strictEqual(resA.confidence_score, undefined, 'Model confidence_score should not be present on classification output');
    console.log('✅ Passed (a) & (b)\n');

    // --- Test (c): treats is_incident: "false" string as non-incident ---
    console.log('Testing (c): Treats is_incident: "false" as non-incident...');
    global.fetch = async (url, options) => {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                is_incident: 'false',
                type: 'Safety',
                severity: 'High'
              })
            }
          }]
        })
      };
    };

    const resC = await classifyReport('Some non incident text');
    assert.strictEqual(resC.is_incident, false);
    console.log('✅ Passed (c)\n');

    // --- Test (d): rejects invalid type or severity, moves to next model, then flagged fallback ---
    console.log('Testing (d): Rejects invalid type or severity, falls back appropriately...');
    let callHistory = [];
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      callHistory.push(body.model);
      return {
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                is_incident: true,
                type: 'INVALID_TYPE',
                severity: 'High'
              })
            }
          }]
        })
      };
    };

    const resD = await classifyReport('Sample text for invalid type');
    assert.deepStrictEqual(callHistory, ['primary-mock-model', 'fallback-mock-model-1']);
    assert.strictEqual(resD.classified_by, 'fallback');
    console.log('✅ Passed (d)\n');

    // --- Test (e): trims and cleans location_text ---
    console.log('Testing (e): Trims location_text, strips control chars, converts "null"/"none" to null...');
    global.fetch = async (url, options) => {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                is_incident: true,
                type: 'Safety',
                severity: 'High',
                location_text: '  Agege market\x07  '
              })
            }
          }]
        })
      };
    };

    const resE1 = await classifyReport('Agege report text');
    assert.strictEqual(resE1.location_text, 'Agege market');

    global.fetch = async (url, options) => {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                is_incident: true,
                type: 'Safety',
                severity: 'High',
                location_text: 'none'
              })
            }
          }]
        })
      };
    };

    const resE2 = await classifyReport('No location report text');
    assert.strictEqual(resE2.location_text, null);
    console.log('✅ Passed (e)\n');

    // --- Test (f): sends report inside delimiters and truncates long text ---
    console.log('Testing (f): Sends report inside <report> delimiters and truncates text to 1000 chars...');
    let lastSentUserContent = '';
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      lastSentUserContent = body.messages[1].content;
      return {
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                is_incident: true,
                type: 'Safety',
                severity: 'High'
              })
            }
          }]
        })
      };
    };

    const longText = 'A'.repeat(1500);
    await classifyReport(longText);
    assert.ok(lastSentUserContent.includes('<report>'));
    assert.ok(lastSentUserContent.includes('</report>'));
    const reportPart = lastSentUserContent.split('<report>\n')[1].split('\n</report>')[0];
    assert.strictEqual(reportPart.length, 1000);
    console.log('✅ Passed (f)\n');

    // --- Test (g): gives up on a hanging request after timeout ---
    console.log('Testing (g): Gives up on hanging request after timeout...');
    global.fetch = async (url, options) => {
      const signal = options.signal;
      return new Promise((resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const startMs = Date.now();
    const resG = await classifyReport('Hanging test report');
    const elapsedMs = Date.now() - startMs;

    assert.strictEqual(resG.classified_by, 'fallback');
    assert.ok(elapsedMs < 1000, `Expected test to finish quickly under short timeout, took ${elapsedMs}ms`);
    console.log('✅ Passed (g)\n');

    console.log('🎉 ALL OFFLINE CLASSIFIER TESTS PASSED SUCCESSFULLY!');
  } finally {
    global.fetch = originalFetch;
  }
}

runClassifierTests().catch(err => {
  console.error('❌ Offline classifier test suite failed:', err);
  process.exit(1);
});

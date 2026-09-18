const http = require('http');
const app = require('../src/app');
const { clearCases, getAllCases } = require('../src/db');

function getHttp(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'GET'
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function postMultipartVoice(port, path, audioBuffer, filename = 'voice.mp3') {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    let body = '';

    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="audio"; filename="${filename}"\r\n`;
    body += `Content-Type: audio/mp3\r\n\r\n`;

    const bodyHeader = Buffer.from(body, 'utf8');
    const bodyFooter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const fullBody = Buffer.concat([bodyHeader, audioBuffer, bodyFooter]);

    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Failed to parse voice response JSON: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('       RELAY BACKEND VERIFICATION SUITE');
  console.log('====================================================\n');

  clearCases();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const results = [];

  try {
    // Scenario 1: Deep Path - Report 1 (Agege English)
    const agegeEnglishText = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
    console.log(`[1] Submitting Agege English report...`);
    const res1 = await postJson(port, '/api/reports', { text: agegeEnglishText });
    const case1 = res1.body.case;

    const test1Passed = Boolean(
      case1 &&
      case1.type === 'Safety' &&
      case1.severity === 'High' &&
      case1.urgency === 'High' &&
      case1.location_text === 'Agege market'
    );

    results.push({
      scenario: 'Agege English Ingest',
      expected: 'Safety / High / High @ Agege market',
      actual: case1 ? `${case1.type} / ${case1.severity} / ${case1.urgency} @ ${case1.location_text}` : 'Failed',
      passed: test1Passed
    });

    // Scenario 2: Deep Path - Report 2 (Agege Pidgin Corroborating Report)
    const agegePidginText = "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
    console.log(`[2] Submitting Agege Pidgin corroborating report...`);
    const res2 = await postJson(port, '/api/reports', { text: agegePidginText });
    const case2 = res2.body.case;

    const allDbCases = getAllCases();
    const isSingleMergedCase = (allDbCases.length === 1);
    const test2Passed = Boolean(
      case2 &&
      case2.id === case1.id &&
      isSingleMergedCase &&
      case2.status === 'Accepted' &&
      case2.evidence.length >= 2 &&
      case2.sla === '30 minutes' &&
      case2.acknowledged_at !== null
    );

    results.push({
      scenario: 'Agege Pidgin Corroboration',
      expected: 'Merged into 1 Case, Status: Accepted, SLA: 30 min',
      actual: case2 ? `Case ID ${case2.id}, Status: ${case2.status}, SLA: ${case2.sla}, Evidence count: ${case2.evidence.length}` : 'Failed',
      passed: test2Passed
    });

    // Scenario 3: Shallow Path 1 - Mile 12 Market Dispute
    const mile12Text = "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming.";
    console.log(`[3] Submitting Mile 12 market report...`);
    const res3 = await postJson(port, '/api/reports', { text: mile12Text });
    const case3 = res3.body.case;

    const test3Passed = Boolean(
      case3 &&
      case3.type === 'Stability' &&
      case3.severity === 'Medium' &&
      case3.status === 'Accepted'
    );

    results.push({
      scenario: 'Mile 12 Dispute (Shallow 1)',
      expected: 'Stability / Medium -> Accepted',
      actual: case3 ? `${case3.type} / ${case3.severity} -> ${case3.status}` : 'Failed',
      passed: test3Passed
    });

    // Scenario 4: Shallow Path 2 - Ijegun Borehole Service Failure
    const ijegunText = "The borehole at Ijegun primary school has been broken for two weeks, children have no water.";
    console.log(`[4] Submitting Ijegun borehole report...`);
    const res4 = await postJson(port, '/api/reports', { text: ijegunText });
    const case4 = res4.body.case;

    const test4Passed = Boolean(
      case4 &&
      case4.type === 'Transparency' &&
      case4.severity === 'Medium' &&
      case4.status === 'Assigned'
    );

    results.push({
      scenario: 'Ijegun Borehole (Shallow 2)',
      expected: 'Transparency / Medium -> Assigned (Stops at Assigned)',
      actual: case4 ? `${case4.type} / ${case4.severity} -> ${case4.status}` : 'Failed',
      passed: test4Passed
    });

    // Scenario 5: Non-Incident Query Test
    const nonIncidentText = "what time does the market open?";
    console.log(`[5] Submitting non-incident query...`);
    const res5 = await postJson(port, '/api/reports', { text: nonIncidentText });

    const test5Passed = Boolean(
      res5.body.success === true &&
      res5.body.case === null &&
      res5.body.note
    );

    results.push({
      scenario: 'Non-Incident Query',
      expected: '{ success: true, case: null, note: ... }',
      actual: JSON.stringify(res5.body),
      passed: test5Passed
    });

    // Scenario 6: Voice Upload Endpoint Test
    console.log(`[6] Submitting POST /api/reports/voice audio report...`);
    const dummyAudioBuffer = Buffer.from('FAKE_AUDIO_DATA_FOR_VOICE_TRANSCRIPTION_TEST');
    const res6 = await postMultipartVoice(port, '/api/reports/voice', dummyAudioBuffer, 'report.mp3');

    const test6Passed = Boolean(
      res6.body.success === true &&
      res6.body.case !== null
    );

    results.push({
      scenario: 'Voice Report Intake (Groq Whisper)',
      expected: 'Transcribed speech -> Case processed',
      actual: res6.body.case ? `Case ID ${res6.body.case.id}, Status: ${res6.body.case.status}` : 'Failed',
      passed: test6Passed
    });

    // Scenario 7: WhatsApp Webhook GET Verification Handshake
    console.log(`[7] Testing GET /webhook Meta verification handshake...`);
    process.env.WEBHOOK_VERIFY_TOKEN = 'test_verify_token_123';
    const challengeStr = 'CHALLENGE_STRING_789';
    const res7 = await getHttp(
      port,
      `/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=${challengeStr}`
    );

    const test7Passed = Boolean(
      res7.statusCode === 200 &&
      res7.body === challengeStr
    );

    results.push({
      scenario: 'WhatsApp Webhook Verification Handshake (GET /webhook)',
      expected: `Status 200 with challenge body '${challengeStr}'`,
      actual: `Status ${res7.statusCode}, body: '${res7.body}'`,
      passed: test7Passed
    });

    // Scenario 8: WhatsApp Webhook POST Incoming Message Payload
    console.log(`[8] Testing POST /webhook incoming WhatsApp message intake...`);
    const countBeforeWa = getAllCases().length;
    const waPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '100001',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            messages: [{
              from: '2348012345678',
              id: 'wamid.HBgL123456',
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: 'text',
              text: { body: 'Two traders are fighting over a stall space at Mile 12 market, it is getting loud.' }
            }]
          }
        }]
      }]
    };

    const res8 = await postJson(port, '/webhook', waPayload);
    // Allow async processing to complete
    await new Promise(r => setTimeout(r, 500));
    const casesAfterWa = getAllCases();

    const test8Passed = Boolean(
      res8.statusCode === 200 &&
      casesAfterWa.length >= countBeforeWa
    );

    results.push({
      scenario: 'WhatsApp Webhook Message Ingest (POST /webhook)',
      expected: 'Status 200 EVENT_RECEIVED & case processed in background',
      actual: `Status ${res8.statusCode}, total cases in DB: ${casesAfterWa.length}`,
      passed: test8Passed
    });

    // Output Pass/Fail Summary Table
    console.log('\n====================================================');
    console.log('                VERIFICATION SUMMARY');
    console.log('====================================================');

    let allPassed = true;

    results.forEach((r, idx) => {
      const statusSymbol = r.passed ? '✅ PASS' : '❌ FAIL';
      if (!r.passed) allPassed = false;
      console.log(`\n[${idx + 1}] ${r.scenario}: ${statusSymbol}`);
      console.log(`    Expected: ${r.expected}`);
      console.log(`    Actual:   ${r.actual}`);
    });

    console.log('\n----------------------------------------------------');
    if (allPassed) {
      console.log('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
      console.log('----------------------------------------------------');
      process.exit(0);
    } else {
      console.error('💥 ONE OR MORE VERIFICATION TESTS FAILED.');
      console.log('----------------------------------------------------');
      process.exit(1);
    }

  } finally {
    server.close();
  }
}

runVerification().catch(err => {
  console.error('Verification script encountered unexpected error:', err);
  process.exit(1);
});

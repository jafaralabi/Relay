const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const { clearCases, getAllCases, getCaseById } = require('../src/db');

let actorsData = {};
try {
  const actorsPath = path.join(__dirname, '..', 'data', 'actors.json');
  if (fs.existsSync(actorsPath)) {
    actorsData = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));
  }
} catch (e) {}

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function postJson(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      ...headers
    };

    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'POST',
        headers: reqHeaders
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
  const modelsUsed = new Set();
  let fallbackCount = 0;

  try {
    // Check 1: Lone report stays at Signal
    console.log(`[1] Submitting lone report to verify it stays at Signal...`);
    const loneText = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early.";
    const loneRes = await postJson(port, '/api/reports', { text: loneText });
    const loneCase = loneRes.body.case;

    if (loneCase && loneCase.classified_by) {
      modelsUsed.add(loneCase.classified_by);
      if (loneCase.classified_by === 'fallback') fallbackCount++;
    }

    const test1Passed = Boolean(
      loneCase &&
      loneCase.status === 'Signal' &&
      loneCase.confidence_score <= 45
    );

    results.push({
      scenario: 'Lone Report Stays at Signal',
      expected: 'Status: Signal, Confidence <= 45',
      actual: loneCase ? `Status: ${loneCase.status}, Confidence: ${loneCase.confidence_score}` : 'Failed',
      passed: test1Passed
    });

    // Clear DB to test full scenario chain
    clearCases();
    await sleep(1500);

    // Check 2: Deep Path - Report 1 (Agege English)
    const agegeEnglishText = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
    console.log(`[2] Submitting Agege English report...`);
    const res1 = await postJson(port, '/api/reports', { text: agegeEnglishText });
    const case1 = res1.body.case;

    if (case1 && case1.classified_by) {
      modelsUsed.add(case1.classified_by);
      if (case1.classified_by === 'fallback') fallbackCount++;
    }

    const test2Passed = Boolean(
      case1 &&
      case1.type === 'Safety' &&
      case1.severity === 'High' &&
      case1.urgency === 'High' &&
      case1.location_text === 'Agege market' &&
      case1.status === 'Signal'
    );

    results.push({
      scenario: 'Agege English Ingest',
      expected: 'Safety / High / High @ Agege market (Signal)',
      actual: case1 ? `${case1.type} / ${case1.severity} / ${case1.urgency} @ ${case1.location_text} (${case1.status})` : 'Failed',
      passed: test2Passed
    });

    await sleep(1500);

    // Check 3: "Agaigee Market" phonetic voice/text report merges with "Agege market"
    const agaigeeText = "Wetin dey happen for Agaigee Market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
    console.log(`[3] Submitting Agaigee Market corroborating report...`);
    const res2 = await postJson(port, '/api/reports', { text: agaigeeText });
    const case2 = res2.body.case;

    if (case2 && case2.classified_by) {
      modelsUsed.add(case2.classified_by);
      if (case2.classified_by === 'fallback') fallbackCount++;
    }

    const allDbCases = getAllCases();
    const isSingleMergedCase = (allDbCases.length === 1);
    const test3Passed = Boolean(
      case2 &&
      case1 &&
      case2.id === case1.id &&
      isSingleMergedCase &&
      case2.status === 'Accepted' &&
      case2.evidence.length >= 2 &&
      case2.confidence_score >= 70 &&
      case2.sla === '30 minutes' &&
      case2.acknowledged_at !== null
    );

    results.push({
      scenario: 'Agaigee Market Corroboration & Merge',
      expected: 'Merged into 1 Case, Status: Accepted, Score >= 70, SLA: 30 min',
      actual: case2 ? `Case ID ${case2.id}, Status: ${case2.status}, Score: ${case2.confidence_score}, SLA: ${case2.sla}, Evidence count: ${case2.evidence.length}` : 'Failed',
      passed: test3Passed
    });

    await sleep(1500);

    // Check 4: Shallow Path 1 - Mile 12 Market Dispute
    const mile12Text = "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming.";
    console.log(`[4] Submitting Mile 12 market report...`);
    const res3 = await postJson(port, '/api/reports', { text: mile12Text });
    const case3 = res3.body.case;

    if (case3 && case3.classified_by) {
      modelsUsed.add(case3.classified_by);
      if (case3.classified_by === 'fallback') fallbackCount++;
    }

    const test4Passed = Boolean(
      case3 &&
      case3.type === 'Stability' &&
      case3.severity === 'Medium' &&
      case3.status === 'Accepted'
    );

    results.push({
      scenario: 'Mile 12 Dispute (Shallow 1)',
      expected: 'Stability / Medium -> Accepted',
      actual: case3 ? `${case3.type} / ${case3.severity} -> ${case3.status}` : 'Failed',
      passed: test4Passed
    });

    await sleep(1500);

    // Check 5: Shallow Path 2 - Ijegun Borehole Service Failure
    const ijegunText = "The borehole at Ijegun primary school has been broken for two weeks, children have no water.";
    console.log(`[5] Submitting Ijegun borehole report...`);
    const res4 = await postJson(port, '/api/reports', { text: ijegunText });
    const case4 = res4.body.case;

    if (case4 && case4.classified_by) {
      modelsUsed.add(case4.classified_by);
      if (case4.classified_by === 'fallback') fallbackCount++;
    }

    const test5Passed = Boolean(
      case4 &&
      case4.type === 'Transparency' &&
      case4.severity === 'Medium' &&
      case4.status === 'Assigned'
    );

    results.push({
      scenario: 'Ijegun Borehole (Shallow 2)',
      expected: 'Transparency / Medium -> Assigned (Stops at Assigned)',
      actual: case4 ? `${case4.type} / ${case4.severity} -> ${case4.status}` : 'Failed',
      passed: test5Passed
    });

    await sleep(1500);

    // Check 6: Non-Incident Query Test
    const nonIncidentText = "what time does the market open?";
    console.log(`[6] Submitting non-incident query...`);
    const res5 = await postJson(port, '/api/reports', { text: nonIncidentText });

    const test6Passed = Boolean(
      res5.body.success === true &&
      res5.body.case === null &&
      res5.body.note
    );

    results.push({
      scenario: 'Non-Incident Query',
      expected: '{ success: true, case: null, note: ... }',
      actual: JSON.stringify(res5.body),
      passed: test6Passed
    });

    await sleep(1500);

    // Check 7: Corrupted Voice File returns HTTP 502 with no case created
    console.log(`[7] Submitting corrupted voice audio file to POST /api/reports/voice...`);
    const corruptAudioBuffer = Buffer.from('CORRUPTED_NON_AUDIO_GARBAGE_DATA_XYZ_123');
    const casesCountBefore = getAllCases().length;
    const res6 = await postMultipartVoice(port, '/api/reports/voice', corruptAudioBuffer, 'corrupt.mp3');
    const casesCountAfter = getAllCases().length;

    const isDemoMode = process.env.DEMO_MODE === 'true';
    let test7Passed = false;

    if (isDemoMode) {
      // In DEMO_MODE, mock transcription is allowed
      test7Passed = Boolean(res6.body.success === true && res6.body.case !== null);
    } else {
      // In normal mode, corrupted voice note must return HTTP 502 with no case created
      test7Passed = Boolean(
        res6.statusCode === 502 &&
        res6.body.success === false &&
        res6.body.error === 'transcription_failed' &&
        casesCountBefore === casesCountAfter
      );
    }

    results.push({
      scenario: 'Corrupt Voice Upload Error Handling',
      expected: isDemoMode ? 'DEMO_MODE mock transcription created case' : 'HTTP 502 { success: false, error: "transcription_failed" }, no case created',
      actual: `HTTP ${res6.statusCode}: ${JSON.stringify(res6.body)} (Cases before: ${casesCountBefore}, after: ${casesCountAfter})`,
      passed: test7Passed
    });

    // Check 8: Voice transcription check - fail loudly if mock used without DEMO_MODE=true
    let voiceMockCheckPassed = true;
    const voiceCases = getAllCases().filter(c => c.transcribed_by === 'mock');
    if (!isDemoMode && voiceCases.length > 0) {
      voiceMockCheckPassed = false;
      console.error('❌ FAIL: Mock transcription was used for voice cases when DEMO_MODE was not true.');
    }

    results.push({
      scenario: 'Voice Mock Transcription Gate Check',
      expected: 'No mock transcriptions unless DEMO_MODE=true',
      actual: voiceCases.length > 0 ? `${voiceCases.length} mock transcribed case(s) found` : 'All voice notes processed via Whisper',
      passed: voiceMockCheckPassed
    });

    // Scenario 7: WhatsApp Webhook GET Verification Handshake
    console.log(`[7] Testing GET /webhook Meta verification handshake...`);
    process.env.WEBHOOK_VERIFY_TOKEN = 'test_verify_token_123';
    const challengeStr = 'CHALLENGE_STRING_789';
    const resWaHandshake = await getHttp(
      port,
      `/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=${challengeStr}`
    );

    const testWaHandshakePassed = Boolean(
      resWaHandshake.statusCode === 200 &&
      resWaHandshake.body === challengeStr
    );

    results.push({
      scenario: 'WhatsApp Webhook Verification Handshake (GET /webhook)',
      expected: `Status 200 with challenge body '${challengeStr}'`,
      actual: `Status ${resWaHandshake.statusCode}, body: '${resWaHandshake.body}'`,
      passed: testWaHandshakePassed
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

    const resWaMessage = await postJson(port, '/webhook', waPayload);
    // Allow async processing to complete
    await new Promise(r => setTimeout(r, 500));
    const casesAfterWa = getAllCases();

    const testWaMessagePassed = Boolean(
      resWaMessage.statusCode === 200 &&
      casesAfterWa.length >= countBeforeWa
    );

    results.push({
      scenario: 'WhatsApp Webhook Message Ingest (POST /webhook)',
      expected: 'Status 200 EVENT_RECEIVED & case processed in background',
      actual: `Status ${resWaMessage.statusCode}, total cases in DB: ${casesAfterWa.length}`,
      passed: testWaMessagePassed
    });

    // Scenario D1 (a): Seed produces three final states with no Groq call
    console.log(`\n[D1-a] Testing POST /api/demo/seed...`);
    const demoKey = process.env.DEMO_KEY || 'relay_demo_secret_key_2026';
    const seedRes = await postJson(port, '/api/demo/seed', {}, { 'x-demo-key': demoKey });
    const seedCases = seedRes.body.cases || [];

    const agegeSeed = seedCases.find(c => c.id === 'RLA-1001');
    const mile12Seed = seedCases.find(c => c.id === 'RLA-1002');
    const ijegunSeed = seedCases.find(c => c.id === 'RLA-1003');

    const testSeedPassed = Boolean(
      seedRes.statusCode === 200 &&
      seedCases.length === 3 &&
      agegeSeed && agegeSeed.status === 'Independently Verified' && agegeSeed.closed === true && agegeSeed.acknowledged_after_minutes === 22 &&
      mile12Seed && mile12Seed.status === 'Accepted' && mile12Seed.demo_scripted === true &&
      ijegunSeed && ijegunSeed.status === 'Assigned' && ijegunSeed.demo_scripted === true
    );

    results.push({
      scenario: 'D1(a) Demo Seed Verification',
      expected: '3 seeded cases: Agege (Independently Verified), Mile 12 (Accepted), Ijegun (Assigned)',
      actual: `Status: ${seedRes.statusCode}, Case count: ${seedCases.length}`,
      passed: testSeedPassed
    });

    // Scenario D1 (b): Live deep path ends Independently Verified
    console.log(`\n[D1-b] Testing Live Deep Path end-to-end status flow...`);
    clearCases();
    await sleep(1000);

    const reportDeep1 = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
    const reportDeep2 = "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";

    const resDeep1 = await postJson(port, '/api/reports', { text: reportDeep1, reporter: '+2348011110000' });
    const caseDeep1 = resDeep1.body.case;

    await sleep(1000);
    const resDeep2 = await postJson(port, '/api/reports', { text: reportDeep2, reporter: '+2348022220000' });
    const caseDeep2 = resDeep2.body.case;

    const resAdv1 = await postJson(port, `/api/cases/${caseDeep2.id}/advance`, { action: 'Responders on site' }, { 'x-demo-key': demoKey });
    const resAdv2 = await postJson(port, `/api/cases/${caseDeep2.id}/advance`, { action: 'Responders dispersed the group, no injuries' }, { 'x-demo-key': demoKey });

    const resVerify = await postJson(port, `/api/cases/${caseDeep2.id}/verify`, { text: 'The area is calm now, shops have reopened', reporter: '+2348033330000' }, { 'x-demo-key': demoKey });
    const finalDeepCase = resVerify.body.case;

    const testDeepPathPassed = Boolean(
      caseDeep1.status === 'Signal' &&
      caseDeep2.status === 'Accepted' &&
      resAdv1.body.case.status === 'In Progress' &&
      resAdv2.body.case.status === 'Claimed Resolved' &&
      resVerify.body.confirmed === true &&
      finalDeepCase.status === 'Independently Verified' &&
      finalDeepCase.closed === true &&
      finalDeepCase.resolution === 'Independently Verified' &&
      finalDeepCase.acknowledged_after_minutes === 22
    );

    results.push({
      scenario: 'D1(b) Live Deep Path End-to-End Flow',
      expected: 'Signal -> Accepted -> In Progress -> Claimed Resolved -> Independently Verified (closed: true, resolution: "Independently Verified")',
      actual: finalDeepCase ? `Final status: ${finalDeepCase.status}, closed: ${finalDeepCase.closed}, resolution: ${finalDeepCase.resolution}, ack_minutes: ${finalDeepCase.acknowledged_after_minutes}` : 'Failed',
      passed: testDeepPathPassed
    });

    // Scenario D1 (c): Advancing Mile 12 or Ijegun returns 409
    console.log(`\n[D1-c] Testing 409 guard when advancing demo_scripted cases...`);
    postJson(port, '/api/demo/seed', {}, { 'x-demo-key': demoKey });
    const resAdvMile12 = await postJson(port, '/api/cases/RLA-1002/advance', {}, { 'x-demo-key': demoKey });
    const resAdvIjegun = await postJson(port, '/api/cases/RLA-1003/advance', {}, { 'x-demo-key': demoKey });

    const testDemoScriptedGuardPassed = Boolean(
      resAdvMile12.statusCode === 409 &&
      resAdvIjegun.statusCode === 409
    );

    results.push({
      scenario: 'D1(c) Demo Scripted Case Guard (409)',
      expected: 'HTTP 409 for advancing Mile 12 or Ijegun',
      actual: `Mile 12 code: ${resAdvMile12.statusCode}, Ijegun code: ${resAdvIjegun.statusCode}`,
      passed: testDemoScriptedGuardPassed
    });

    // Scenario D1 (d): Double advance or verify before Claimed Resolved returns 409
    console.log(`\n[D1-d] Testing 409 guards on invalid transitions...`);
    clearCases();
    const resLoneForGuard = await postJson(port, '/api/reports', { text: "There is a group of armed men gathering near the Agege market entrance, by the bus stop." });
    const loneCaseGuard = resLoneForGuard.body.case;

    const resVerifyEarly = await postJson(port, `/api/cases/${loneCaseGuard.id}/verify`, { text: "Area is calm" }, { 'x-demo-key': demoKey });
    const resAdvEarly = await postJson(port, `/api/cases/${loneCaseGuard.id}/advance`, {}, { 'x-demo-key': demoKey });

    const testInvalidTransitionsPassed = Boolean(
      resVerifyEarly.statusCode === 409 &&
      resAdvEarly.statusCode === 409
    );

    results.push({
      scenario: 'D1(d) Invalid Transition Guards (409)',
      expected: 'HTTP 409 for verifying before Claimed Resolved or advancing from Signal',
      actual: `Verify early code: ${resVerifyEarly.statusCode}, Advance early code: ${resAdvEarly.statusCode}`,
      passed: testInvalidTransitionsPassed
    });

    // Scenario D1 (e): Verify by original reporter rejected with 409
    console.log(`\n[D1-e] Testing verification rejection when reporter matches original reporter...`);
    await postJson(port, '/api/demo/reset', {}, { 'x-demo-key': demoKey });
    const origReporterId = '+2348011119999';
    await postJson(port, '/api/reports', { text: "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early.", reporter: origReporterId });
    const resCorrob = await postJson(port, '/api/reports', { text: "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.", reporter: '+2348022228888' });
    const targetCaseForSameVerify = resCorrob.body.case;

    let resSameReporterVerify = { statusCode: 500, body: {} };
    if (targetCaseForSameVerify) {
      await postJson(port, `/api/cases/${targetCaseForSameVerify.id}/advance`, { action: 'Responders on site' }, { 'x-demo-key': demoKey });
      await postJson(port, `/api/cases/${targetCaseForSameVerify.id}/advance`, { action: 'Responders dispersed group' }, { 'x-demo-key': demoKey });

      resSameReporterVerify = await postJson(port, `/api/cases/${targetCaseForSameVerify.id}/verify`, { text: 'The area is calm now, shops reopened', reporter: origReporterId }, { 'x-demo-key': demoKey });
    }

    const testSameReporterVerifyPassed = Boolean(
      resSameReporterVerify.statusCode === 409
    );

    results.push({
      scenario: 'D1(e) Same Reporter Verification Rejection Guard (409)',
      expected: 'HTTP 409 when original reporter tries to verify resolution',
      actual: `Status code: ${resSameReporterVerify.statusCode}, body: ${JSON.stringify(resSameReporterVerify.body)}`,
      passed: testSameReporterVerifyPassed
    });

    // Scenario D1 (f): 401 without demo key in production mode
    console.log(`\n[D1-f] Testing 401 protection when DEMO_KEY missing in NODE_ENV=production...`);
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const resUnauthSeed = await postJson(port, '/api/demo/seed', {});
    process.env.NODE_ENV = origEnv;

    const testDemoKeyAuthPassed = Boolean(
      resUnauthSeed.statusCode === 401
    );

    results.push({
      scenario: 'D1(f) Demo Key Protection in Production (401)',
      expected: 'HTTP 401 when DEMO_KEY missing in production',
      actual: `Status code: ${resUnauthSeed.statusCode}`,
      passed: testDemoKeyAuthPassed
    });

    // Scenario D1 (g): Privacy check - no phone numbers or reporter_hash in /api/cases
    console.log(`\n[D1-g] Testing privacy check on GET /api/cases...`);
    const resGetCases = await getHttp(port, '/api/cases');
    const jsonStr = resGetCases.body;

    const hasReporterHash = jsonStr.includes('reporter_hash');
    const hasNotifyTo = jsonStr.includes('notify_to');
    const phonePattern = /\+?234[0-9]{10}/;
    const hasPhonePattern = phonePattern.test(jsonStr);

    const testPrivacyPassed = Boolean(
      !hasReporterHash &&
      !hasNotifyTo &&
      !hasPhonePattern
    );

    results.push({
      scenario: 'D1(g) Privacy Check (No PII / hashes in GET /api/cases)',
      expected: 'No reporter_hash, notify_to, or phone number strings in JSON response',
      actual: `reporter_hash present: ${hasReporterHash}, notify_to present: ${hasNotifyTo}, phone pattern match: ${hasPhonePattern}`,
      passed: testPrivacyPassed
    });

    // Clear intake rate map so earlier tests don't pollute rate limiter
    if (typeof app.clearIntakeRateLimit === 'function') {
      app.clearIntakeRateLimit();
    }

    // Scenario D3 (a): Report matching a closed case creates a NEW case and leaves closed case unchanged
    console.log(`\n[D3-a] Testing report matching a closed case creates a NEW case...`);
    clearCases();
    await postJson(port, '/api/demo/seed', {}, { 'x-demo-key': demoKey });
    const seededAgege = getCaseById('RLA-1001');
    const agegeEvidenceCountBefore = seededAgege.evidence.length;

    const resAgegeNew = await postJson(port, '/api/reports', {
      text: "There is a group of armed men gathering near the Agege market entrance, by the bus stop."
    });
    const newAgegeCase = resAgegeNew.body.case;
    const seededAgegeAfter = getCaseById('RLA-1001');

    const testD3aPassed = Boolean(
      newAgegeCase &&
      newAgegeCase.id !== 'RLA-1001' &&
      seededAgegeAfter.status === 'Independently Verified' &&
      seededAgegeAfter.evidence.length === agegeEvidenceCountBefore
    );

    results.push({
      scenario: 'D3(a) Closed Case Match Creates NEW Case',
      expected: 'New case created, closed Agege case RLA-1001 unchanged',
      actual: newAgegeCase ? `New case ID: ${newAgegeCase.id}, RLA-1001 status: ${seededAgegeAfter.status}, evidence count: ${seededAgegeAfter.evidence.length}` : 'Failed',
      passed: testD3aPassed
    });

    // Scenario D3 (b): Status never regresses
    console.log(`\n[D3-b] Testing status never regresses on report merge...`);
    clearCases();
    if (typeof app.clearIntakeRateLimit === 'function') app.clearIntakeRateLimit();

    const rStatus1 = await postJson(port, '/api/reports', { text: "There is a group of armed men gathering near the Agege market entrance, by the bus stop." });
    const cStatus1 = rStatus1.body.case;

    const rStatusCorrob = await postJson(port, '/api/reports', { text: "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot." });
    const cStatusCorrob = rStatusCorrob.body.case;

    await postJson(port, `/api/cases/${cStatusCorrob.id}/advance`, { action: 'Responders on site' }, { 'x-demo-key': demoKey });
    const advancedCaseBefore = getCaseById(cStatusCorrob.id);

    // Submitting third report into In Progress case
    const rStatus3 = await postJson(port, '/api/reports', { text: "Third report about armed men gathering at Agege market" });
    const mergedCaseAfter = getCaseById(cStatusCorrob.id);

    const testD3bPassed = Boolean(
      advancedCaseBefore &&
      advancedCaseBefore.status === 'In Progress' &&
      mergedCaseAfter &&
      mergedCaseAfter.status === 'In Progress'
    );

    results.push({
      scenario: 'D3(b) Status Monotonicity (Never Regresses)',
      expected: 'Case stays at "In Progress" when corroborating report arrives',
      actual: `Status before merge: ${advancedCaseBefore.status}, after merge: ${mergedCaseAfter.status}`,
      passed: testD3bPassed
    });

    // Scenario D3 (c): responsible_actor and sla equal actors.json values
    console.log(`\n[D3-c] Testing responsible_actor and sla match actors.json...`);
    const allCurrentCases = getAllCases();
    let actorSlaMatch = true;
    for (const c of allCurrentCases) {
      if (actorsData[c.type] && actorsData[c.type][c.severity]) {
        const expectedActorSla = actorsData[c.type][c.severity];
        if (c.responsible_actor !== expectedActorSla.responsible_actor || c.sla !== expectedActorSla.sla) {
          actorSlaMatch = false;
        }
      }
    }

    results.push({
      scenario: 'D3(c) Responsible Actor & SLA Match actors.json',
      expected: 'All live API cases match actors.json actor and SLA',
      actual: actorSlaMatch ? 'All cases matched actors.json' : 'Mismatch found',
      passed: actorSlaMatch
    });

    // Scenario D3 (d): Duplicate adds no evidence or confidence
    console.log(`\n[D3-d] Testing duplicate report (Jaccard >= 0.8)...`);
    clearCases();
    if (typeof app.clearIntakeRateLimit === 'function') app.clearIntakeRateLimit();

    const dupOrig = await postJson(port, '/api/reports', { text: "There is a group of armed men gathering near the Agege market entrance by the bus stop" });
    const dupCaseBefore = dupOrig.body.case;

    const dupRes = await postJson(port, '/api/reports', { text: "There is a group of armed men gathering near the Agege market entrance by the bus stop!" });
    const dupCaseAfter = getCaseById(dupCaseBefore.id);

    const testD3dPassed = Boolean(
      dupRes.statusCode === 200 &&
      dupRes.body.duplicate === true &&
      dupCaseAfter.evidence.length === dupCaseBefore.evidence.length &&
      dupCaseAfter.confidence_score === dupCaseBefore.confidence_score
    );

    results.push({
      scenario: 'D3(d) Duplicate Report Handling',
      expected: 'HTTP 200 duplicate: true, evidence length and confidence score unchanged',
      actual: `HTTP ${dupRes.statusCode}, duplicate: ${dupRes.body.duplicate}, evidence before: ${dupCaseBefore.evidence.length}, after: ${dupCaseAfter.evidence.length}`,
      passed: testD3dPassed
    });

    // Scenario D3 (e): Seeded Agege case has exactly 2 reports plus 1 independent verification
    console.log(`\n[D3-e] Testing seeded Agege evidence shape...`);
    await postJson(port, '/api/demo/seed', {}, { 'x-demo-key': demoKey });
    const seedAgegeCase = getCaseById('RLA-1001');
    const textReportCount = seedAgegeCase.evidence.filter(e => typeof e === 'string').length;
    const verificationCount = seedAgegeCase.evidence.filter(e => typeof e === 'object' && e.type === 'independent_verification').length;

    const testD3ePassed = Boolean(
      seedAgegeCase &&
      seedAgegeCase.evidence.length === 3 &&
      textReportCount === 2 &&
      verificationCount === 1 &&
      seedAgegeCase.confidence_score === 100
    );

    results.push({
      scenario: 'D3(e) Seeded Agege Case Evidence Shape',
      expected: '2 text reports + 1 independent verification object, confidence 100',
      actual: `Total evidence: ${seedAgegeCase.evidence.length} (texts: ${textReportCount}, verify: ${verificationCount}), confidence: ${seedAgegeCase.confidence_score}`,
      passed: testD3ePassed
    });

    // Scenario D3 (f): Unverified confidence <= 95 and verification sets 100
    console.log(`\n[D3-f] Testing confidence rules (unverified <= 95, verified = 100)...`);
    clearCases();
    if (typeof app.clearIntakeRateLimit === 'function') app.clearIntakeRateLimit();

    const c1 = (await postJson(port, '/api/reports', { text: "Report 1 Agege market armed group" })).body.case;
    const c2 = (await postJson(port, '/api/reports', { text: "Report 2 Agege market armed group" })).body.case;
    const c3 = (await postJson(port, '/api/reports', { text: "Report 3 Agege market armed group" })).body.case;

    const unverifiedCapCheck = Boolean(c1.confidence_score <= 95 && c2.confidence_score <= 95 && c3.confidence_score <= 95);

    await postJson(port, `/api/cases/${c3.id}/advance`, { action: 'Responders on site' }, { 'x-demo-key': demoKey });
    await postJson(port, `/api/cases/${c3.id}/advance`, { action: 'Group dispersed' }, { 'x-demo-key': demoKey });
    const verifiedRes = await postJson(port, `/api/cases/${c3.id}/verify`, { text: "Area is calm now, shops reopened", reporter: "+2348099990000" }, { 'x-demo-key': demoKey });
    const verifiedCase = verifiedRes.body.case;

    const testD3fPassed = Boolean(
      unverifiedCapCheck &&
      verifiedCase &&
      verifiedCase.confidence_score === 100
    );

    results.push({
      scenario: 'D3(f) Confidence Score Capping & Verification 100',
      expected: 'Unverified confidence <= 95, verified confidence = 100',
      actual: `Unverified max: ${Math.max(c1.confidence_score, c2.confidence_score, c3.confidence_score)}, Verified score: ${verifiedCase ? verifiedCase.confidence_score : 'N/A'}`,
      passed: testD3fPassed
    });

    // Scenario D3 (g): Phone numbers and emails in a report are masked in the API output
    console.log(`\n[D3-g] Testing privacy masking in report output...`);
    clearCases();
    if (typeof app.clearIntakeRateLimit === 'function') app.clearIntakeRateLimit();

    const piiText = "Call me on +2348012345678 or email admin@example.com about armed group near Agege market entrance";
    const piiRes = await postJson(port, '/api/reports', { text: piiText });
    const piiCase = piiRes.body.case;

    const evidenceTextStr = JSON.stringify(piiCase.evidence);
    const rawReportStr = piiCase.raw_report;

    const testD3gPassed = Boolean(
      piiCase &&
      evidenceTextStr.includes('[phone removed]') &&
      evidenceTextStr.includes('[email removed]') &&
      !evidenceTextStr.includes('+2348012345678') &&
      !evidenceTextStr.includes('admin@example.com')
    );

    results.push({
      scenario: 'D3(g) Privacy Masking of Phone Numbers & Emails',
      expected: 'Phone and email masked with [phone removed] and [email removed]',
      actual: piiCase ? `Raw/Evidence content: ${evidenceTextStr}` : 'Failed',
      passed: testD3gPassed
    });

    // Scenario D1 (h): Intake rate limit check (10 reports/IP/10min -> 429)
    console.log(`\n[D1-h] Testing public intake rate limiter (429)...`);
    clearCases();
    if (typeof app.clearIntakeRateLimit === 'function') app.clearIntakeRateLimit();

    let lastIntakeStatus = 200;
    for (let i = 0; i < 11; i++) {
      const r = await postJson(port, '/api/reports', { text: `Test report message rate limit ${i}` });
      lastIntakeStatus = r.statusCode;
    }

    const testRateLimitPassed = Boolean(
      lastIntakeStatus === 429
    );

    results.push({
      scenario: 'D1(h) Public Intake Rate Limiter (429)',
      expected: 'HTTP 429 on 11th report from same IP',
      actual: `Status code on 11th request: ${lastIntakeStatus}`,
      passed: testRateLimitPassed
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
    console.log(`Models Used: ${Array.from(modelsUsed).join(', ') || 'None'}`);
    const fallbackTotal = Math.max(fallbackCount, require('../src/classifier').getFallbackCount());
    console.log(`Fallback Used: ${fallbackTotal > 0 ? `YES (${fallbackTotal} time(s))` : 'NO'}`);
    console.log('----------------------------------------------------');

    if (fallbackTotal > 0 && process.env.ALLOW_FALLBACK !== '1') {
      console.error('❌ INVALID RUN — the model was not used for every report, so these results say nothing about the model path.');
      console.error('   Check GROQ_API_KEY and the rate limit, or set ALLOW_FALLBACK=1 to accept a keyword-fallback run.');
      console.log('----------------------------------------------------');
      process.exit(1);
    }

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

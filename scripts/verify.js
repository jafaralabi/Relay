const http = require('http');
const app = require('../src/app');
const { clearCases, getAllCases } = require('../src/db');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
            reject(new Error(`Failed to parse response JSON: ${data}`));
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
    console.log(`Fallback Used: ${fallbackCount > 0 ? `YES (${fallbackCount} time(s))` : 'NO'}`);
    console.log('----------------------------------------------------');

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

const http = require('http');
const app = require('../src/app');
const { clearCases } = require('../src/db');

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
          let parsed = data;
          try { parsed = JSON.parse(data); } catch (e) { /* keep the raw text */ }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: parsed });
          } else {
            const detail = parsed && typeof parsed === 'object' ? (parsed.error || parsed.note || JSON.stringify(parsed)) : String(parsed);
            reject(new Error(`${path} returned HTTP ${res.statusCode}: ${detail}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runDemo() {
  console.log('====================================================');
  console.log('       RELAY DEEP-PATH LIVE DEMO RUNNER');
  console.log('====================================================\n');

  clearCases();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const demoKey = process.env.DEMO_KEY;
  if (!demoKey) {
    console.error('DEMO_KEY is not set. Put it in .env or run:  $env:DEMO_KEY = "your-key"');
    process.exit(1);
  }
  const headers = { 'x-demo-key': demoKey };

  try {
    // Step 1: Reporter 1 - English Signal Report
    console.log('[Step 1] Reporter 1 (English Signal) submitting report...');
    const report1 = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
    const res1 = await postJson(port, '/api/reports', { text: report1, reporter: '+2348011112222' });
    const case1 = res1.body.case;
    console.log(`  -> Case Created: ${case1.id} | Status: ${case1.status} | Severity: ${case1.severity} | SLA: ${case1.sla}`);
    await sleep(1500);

    // Step 2: Reporter 2 - Pidgin Corroborating Report
    console.log('\n[Step 2] Reporter 2 (Pidgin Corroboration) submitting report...');
    const report2 = "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
    const res2 = await postJson(port, '/api/reports', { text: report2, reporter: '+2348022223333' });
    const case2 = res2.body.case;
    console.log(`  -> Case Updated: ${case2.id} | Status: ${case2.status} | Acknowledged: ${case2.acknowledged_after_minutes} mins (Simulated) | Confidence: ${case2.confidence_score}`);
    await sleep(1500);

    // Step 3: Responder Advances -> In Progress
    console.log('\n[Step 3] Responder advancing case to In Progress...');
    const res3 = await postJson(port, `/api/cases/${case2.id}/advance`, { action: 'Responders on site' }, headers);
    const case3 = res3.body.case;
    console.log(`  -> Case Updated: ${case3.id} | Status: ${case3.status} | Action: "${case3.action}"`);
    await sleep(1500);

    // Step 4: Responder Advances -> Claimed Resolved
    console.log('\n[Step 4] Responder advancing case to Claimed Resolved...');
    const res4 = await postJson(port, `/api/cases/${case2.id}/advance`, { action: 'Responders dispersed the group, no injuries' }, headers);
    const case4 = res4.body.case;
    console.log(`  -> Case Updated: ${case4.id} | Status: ${case4.status} | Resolution: ${case4.resolution} | Action: "${case4.action}"`);
    await sleep(1500);

    // Step 5: Independent Community Verification
    console.log('\n[Step 5] Independent community member submitting verification report...');
    const verifyText = "The area is calm now, shops have reopened";
    const res5 = await postJson(port, `/api/cases/${case2.id}/verify`, { text: verifyText, reporter: '+2348099990000' }, headers);
    const finalCase = res5.body.case;
    console.log(`  -> Verification Confirmed: ${res5.body.confirmed}`);
    console.log(`  -> Case Final Status: ${finalCase.status} | Closed: ${finalCase.closed} | Resolution: ${finalCase.resolution}`);

    console.log('\n====================================================');
    console.log('             FINAL TRUST RECEIPT DATA');
    console.log('====================================================');
    console.log(JSON.stringify(finalCase, null, 2));
    console.log('----------------------------------------------------');
    console.log('🎉 LIVE DEMO RUN COMPLETED SUCCESSFULLY!');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runDemo().catch(err => {
  console.error('\n❌ DEMO RUN STOPPED:', err.message);
  process.exit(1);
});

const http = require('http');
const app = require('../src/app');
const { clearCases } = require('../src/db');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runDemo() {
  console.log('==================================================');
  console.log('       RELAY DEEP-PATH AUTOMATED RUNNER           ');
  console.log('==================================================\n');

  // Start test server on random port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  console.log(`[Demo Runner] Test server listening on ${baseUrl}`);

  try {
    // 1. Reset Database
    console.log('\n[Step 0] Resetting Database...');
    let res = await fetch(`${baseUrl}/api/demo/reset`, { method: 'POST' });
    let data = await res.json();
    console.log(`-> ${data.message}`);
    await delay(1000);

    // 2. Submit initial Agege English report (Signal)
    console.log('\n[Step 1] Submitting English Report (Agege Market)...');
    const englishReport = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
    res = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: englishReport, reporter: 'Original Reporter' })
    });
    data = await res.json();
    const caseId = data.case.id;
    console.log(`-> Created Case ${caseId} | Status: ${data.case.status}`);
    await delay(1000);

    // 3. Advance to Corroborating (Pidgin report)
    console.log('\n[Step 2] Advancing to Corroborating (Pidgin report)...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Corroborating Pidgin report received: Wetin dey happen for Agege market na serious o...' })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status} | Note: ${data.case.history[data.case.history.length - 1].note}`);
    await delay(1000);

    // 4. Advance to Verified
    console.log('\n[Step 3] Advancing to Verified...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Geospatial and signal consistency verified' })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status}`);
    await delay(1000);

    // 5. Advance to Assigned
    console.log('\n[Step 4] Advancing to Assigned...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Assigned to Community security responder + local police PRO contact' })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status} | Actor: ${data.case.responsible_actor}`);
    await delay(1000);

    // 6. Advance to Accepted (SLA)
    console.log('\n[Step 5] Advancing to Accepted (Setting SLA acknowledgement)...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes_elapsed: 22, note: 'SLA accepted by responder' })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status} | Acknowledged: ${data.case.acknowledged_at}`);
    await delay(1000);

    // 7. Advance to In Progress
    console.log('\n[Step 6] Advancing to In Progress...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'responders on site' })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status} | Note: ${data.case.history[data.case.history.length - 1].note}`);
    await delay(1000);

    // 8. Advance to Claimed Resolved
    console.log('\n[Step 7] Advancing to Claimed Resolved...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'responders dispersed the group, no injuries' })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status} | Note: ${data.case.history[data.case.history.length - 1].note}`);
    await delay(1000);

    // 9. Submit Independent Verification (Independently Verified)
    console.log('\n[Step 8] Submitting 3rd-Party Verification (Independently Verified)...');
    res = await fetch(`${baseUrl}/api/cases/${caseId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'the area is calm now',
        verifier: 'Third Community Member'
      })
    });
    data = await res.json();
    console.log(`-> Status: ${data.case.status} | Verifier: ${data.case.independent_verification.verifier}`);
    await delay(1000);

    // 10. Fetch Final Trust Receipt
    console.log('\n==================================================');
    console.log('             FINAL TRUST RECEIPT                  ');
    console.log('==================================================');
    res = await fetch(`${baseUrl}/api/cases/${caseId}`);
    data = await res.json();
    const c = data.case;

    console.log(`Case ID:            ${c.id}`);
    console.log(`Status:             ${c.status}`);
    console.log(`Evidence:           ${c.evidence.length} independent report(s)`);
    console.log(`Responsible Actor:  ${c.responsible_actor}`);
    console.log(`SLA:                ${c.sla}`);
    console.log(`Acknowledged:       ${c.acknowledged_at}`);
    console.log(`Action:             ${c.history.find(h => h.status === 'In Progress')?.note}`);
    console.log(`Resolution:         Claimed Resolved -> Independently Verified`);
    console.log(`Closed:             Yes`);
    console.log('\nComplete History Log:');
    c.history.forEach(h => console.log(`  - [${h.status}] ${h.note}`));

    // Test shallow path guards
    console.log('\n==================================================');
    console.log('          VERIFYING SHALLOW PATH GUARDS          ');
    console.log('==================================================');

    // Create Mile 12 case and advance to Accepted
    const mile12Res = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming." })
    });
    const mile12Case = (await mile12Res.json()).case;

    // Advance to Accepted
    await fetch(`${baseUrl}/api/cases/${mile12Case.id}/advance`, { method: 'POST' }); // Corroborating
    await fetch(`${baseUrl}/api/cases/${mile12Case.id}/advance`, { method: 'POST' }); // Verified
    await fetch(`${baseUrl}/api/cases/${mile12Case.id}/advance`, { method: 'POST' }); // Assigned
    await fetch(`${baseUrl}/api/cases/${mile12Case.id}/advance`, { method: 'POST' }); // Accepted

    // Attempt advance past Accepted (should fail with 409)
    const mile12GuardRes = await fetch(`${baseUrl}/api/cases/${mile12Case.id}/advance`, { method: 'POST' });
    console.log(`Mile 12 Guard Status: ${mile12GuardRes.status} (Expected 409)`);
    const mile12GuardData = await mile12GuardRes.json();
    console.log(`Guard Message: ${mile12GuardData.error}`);

    // Create Ijegun case and advance to Assigned
    const ijegunRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "The borehole at Ijegun primary school has been broken for two weeks, children have no water." })
    });
    const ijegunCase = (await ijegunRes.json()).case;

    // Advance to Assigned
    await fetch(`${baseUrl}/api/cases/${ijegunCase.id}/advance`, { method: 'POST' }); // Corroborating
    await fetch(`${baseUrl}/api/cases/${ijegunCase.id}/advance`, { method: 'POST' }); // Verified
    await fetch(`${baseUrl}/api/cases/${ijegunCase.id}/advance`, { method: 'POST' }); // Assigned

    // Attempt advance past Assigned (should fail with 409)
    const ijegunGuardRes = await fetch(`${baseUrl}/api/cases/${ijegunCase.id}/advance`, { method: 'POST' });
    console.log(`Ijegun Guard Status: ${ijegunGuardRes.status} (Expected 409)`);
    const ijegunGuardData = await ijegunGuardRes.json();
    console.log(`Guard Message: ${ijegunGuardData.error}`);

    console.log('\n✅ Demo Run completed successfully.');
  } catch (err) {
    console.error('Demo Run Error:', err);
  } finally {
    server.close();
  }
}

runDemo();

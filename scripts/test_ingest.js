const app = require('../src/app');
const { clearCases, getAllCases } = require('../src/db');
const http = require('http');

const TEST_INPUT = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";

async function runTest() {
  console.log('--- Starting Relay Intake & Classification Test ---');

  // Clear DB for clean test run
  clearCases();

  // Start temporary server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test server listening on port ${port}`);

  try {
    // 1. Submit text report via POST /api/reports
    console.log(`\nSubmitting report:\n"${TEST_INPUT}"\n`);

    const postData = JSON.stringify({ text: TEST_INPUT });
    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: port,
          path: '/api/reports',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        },
        res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    console.log(`[Response Status] ${response.statusCode}`);
    console.log('[Created Case Record]:');
    console.log(JSON.stringify(response.body, null, 2));

    const caseData = response.body.case;

    // Assertions
    if (!caseData) {
      throw new Error('No case returned in response body');
    }
    if (caseData.status !== 'Signal') {
      throw new Error(`Expected status 'Signal', got '${caseData.status}'`);
    }
    if (caseData.type !== 'Safety') {
      throw new Error(`Expected type 'Safety', got '${caseData.type}'`);
    }
    if (caseData.severity !== 'High') {
      throw new Error(`Expected severity 'High', got '${caseData.severity}'`);
    }
    if (caseData.urgency !== 'High') {
      throw new Error(`Expected urgency 'High', got '${caseData.urgency}'`);
    }

    console.log('\n✅ Classification assertions passed:');
    console.log(`- Type: ${caseData.type}`);
    console.log(`- Severity: ${caseData.severity}`);
    console.log(`- Urgency: ${caseData.urgency}`);
    console.log(`- Status: ${caseData.status}`);
    console.log(`- Responsible Actor: ${caseData.responsible_actor}`);
    console.log(`- SLA: ${caseData.sla}`);

    // 2. Fetch DB dump
    const allCases = getAllCases();
    console.log('\n--- Current Database Dump (all cases) ---');
    console.log(JSON.stringify(allCases, null, 2));

  } finally {
    server.close();
  }
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

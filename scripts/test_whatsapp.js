const app = require('../src/app');
const { clearCases, getAllCases } = require('../src/db');
const http = require('http');

process.env.WEBHOOK_VERIFY_TOKEN = 'test_verify_token_123';

async function runWhatsAppTests() {
  console.log('--- Starting WhatsApp Webhook Integration Tests ---');
  clearCases();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test server listening on port ${port}`);

  try {
    // 1. Test GET /webhook verification handshake success
    console.log('\n[Test 1] Testing GET /webhook verification handshake (valid token)...');
    const verifyUrl = `http://localhost:${port}/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=CHALLENGE_ACCEPTED`;
    const verifyRes = await new Promise((resolve, reject) => {
      http.get(verifyUrl, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }).on('error', reject);
    });

    if (verifyRes.statusCode !== 200 || verifyRes.data !== 'CHALLENGE_ACCEPTED') {
      throw new Error(`Verification failed. Status: ${verifyRes.statusCode}, Data: ${verifyRes.data}`);
    }
    console.log('✅ GET /webhook verification succeeded.');

    // 2. Test GET /webhook verification failure (invalid token)
    console.log('\n[Test 2] Testing GET /webhook verification handshake (invalid token)...');
    const invalidUrl = `http://localhost:${port}/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=CHALLENGE_FAIL`;
    const invalidRes = await new Promise((resolve, reject) => {
      http.get(invalidUrl, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }).on('error', reject);
    });

    if (invalidRes.statusCode !== 403) {
      throw new Error(`Expected 403 status for invalid token, got ${invalidRes.statusCode}`);
    }
    console.log('✅ Invalid token correctly rejected with 403 Forbidden.');

    // 3. Test POST /webhook text message payload
    console.log('\n[Test 3] Testing POST /webhook incoming WhatsApp text message payload...');
    const whatsappPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550001234',
                  phone_number_id: 'PHONE_NUMBER_ID'
                },
                contacts: [{ profile: { name: 'Test Reporter' }, wa_id: '2348000000000' }],
                messages: [
                  {
                    from: '2348000000000',
                    id: 'wamid.HBflS1234567890=',
                    timestamp: '1726685000',
                    text: {
                      body: 'Two traders are fighting over a stall space at Mile 12 market, it is getting loud and a crowd is forming.'
                    },
                    type: 'text'
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const postData = JSON.stringify(whatsappPayload);
    const postRes = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: port,
          path: '/webhook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        },
        res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    if (postRes.statusCode !== 200) {
      throw new Error(`POST /webhook returned status ${postRes.statusCode}`);
    }
    console.log('✅ POST /webhook acknowledged with status 200.');

    // Allow async processing to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify case created in database
    const cases = getAllCases();
    if (cases.length !== 1) {
      throw new Error(`Expected 1 case created in DB, found ${cases.length}`);
    }

    const createdCase = cases[0];
    if (createdCase.status !== 'Signal') {
      throw new Error(`Expected case status 'Signal', got '${createdCase.status}'`);
    }
    if (createdCase.type !== 'Stability') {
      throw new Error(`Expected case type 'Stability', got '${createdCase.type}'`);
    }

    console.log('✅ Async case processing successfully created case record:');
    console.log(`- Case ID: ${createdCase.id}`);
    console.log(`- Status: ${createdCase.status}`);
    console.log(`- Type: ${createdCase.type}`);
    console.log(`- Severity: ${createdCase.severity}`);
    console.log(`- Responsible Actor: ${createdCase.responsible_actor}`);

    console.log('\n🎉 All WhatsApp integration tests passed successfully!');
  } finally {
    server.close();
  }
}

runWhatsAppTests().catch(err => {
  console.error('WhatsApp Test failed:', err);
  process.exit(1);
});

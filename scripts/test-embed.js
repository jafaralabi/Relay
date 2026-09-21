/**
 * Offline test for the embeddable widget and cross-origin access (no network, no API key).   Run: node scripts/test-embed.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const dbFile = path.join(os.tmpdir(), `relay-embed-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;
process.env.DEMO_KEY = 'embed-test-key';
process.env.GROQ_API_KEY = 'embed-test-groq-key';
process.env.NODE_ENV = 'development';
delete process.env.CORS_ORIGINS;

const app = require('../src/app');
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
const results = [];
function check(name, ok, detail = '') { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : '   [' + detail + ']')); }
async function call(method, p, headers = {}) { const r = await fetch(BASE + p, { method, headers }); return { r, text: await r.text() }; }

(async () => {
  let { r } = await call('OPTIONS', '/api/reports', { Origin: 'https://partner.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' });
  check('preflight for POST /api/reports is answered (204) and allows any origin', r.status === 204 && r.headers.get('access-control-allow-origin') === '*', 'status=' + r.status + ' acao=' + r.headers.get('access-control-allow-origin'));
  check('preflight allows only Content-Type (not the demo key header)', /content-type/i.test(r.headers.get('access-control-allow-headers') || '') && !/demo/i.test(r.headers.get('access-control-allow-headers') || ''));
  ({ r } = await call('GET', '/api/cases', { Origin: 'https://partner.example' }));
  check('GET /api/cases can be read from another website', r.status === 200 && r.headers.get('access-control-allow-origin') === '*');
  ({ r } = await call('GET', '/api/cases/RLA-0000', { Origin: 'https://partner.example' }));
  check('GET /api/cases/{id} can be read from another website (even for a missing case)', r.status === 404 && r.headers.get('access-control-allow-origin') === '*');
  ({ r } = await call('OPTIONS', '/api/cases/RLA-1234/advance', { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }));
  check('demo controls are NOT opened to other websites', !r.headers.get('access-control-allow-origin'), 'acao=' + r.headers.get('access-control-allow-origin'));
  ({ r } = await call('POST', '/api/demo/reset', { Origin: 'https://evil.example' }));
  check('demo reset is refused without the key and has no CORS header', r.status === 401 && !r.headers.get('access-control-allow-origin'), 'status=' + r.status);
  ({ r } = await call('OPTIONS', '/webhook', { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }));
  check('the WhatsApp webhook is NOT opened to other websites', !r.headers.get('access-control-allow-origin'));
  process.env.CORS_ORIGINS = 'https://partner.example';
  ({ r } = await call('GET', '/api/cases', { Origin: 'https://partner.example' }));
  check('CORS_ORIGINS restricts the allowed origin', r.headers.get('access-control-allow-origin') === 'https://partner.example');
  delete process.env.CORS_ORIGINS;
  let t;
  ({ r, text: t } = await call('GET', '/embed.js'));
  check('the widget script is served', r.status === 200 && t.includes('data-source') && /javascript/.test(r.headers.get('content-type') || ''), 'status=' + r.status);
  ({ r, text: t } = await call('GET', '/embed-demo.html'));
  check('the partner-website demo page embeds the widget with a source name', r.status === 200 && t.includes('/embed.js') && t.includes('data-source="SunBright Solar"'));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  server.close();
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + suffix); } catch (_) { /* ignore */ } }
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });

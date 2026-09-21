/**
 * Offline test for multi-source reporting (no network, no API key).    Run: node scripts/test-sources.js
 * Checks that reports from different applications are attributed, corroborate one case, and are sanitised.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbFile = path.join(os.tmpdir(), `relay-sources-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;
process.env.DEMO_KEY = 'sources-test-key';
process.env.GROQ_API_KEY = 'sources-test-groq-key';
process.env.REPORTER_SALT = 'sources-test-salt';
process.env.NODE_ENV = 'development';
delete process.env.HOSTED_READONLY;

const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.groq.com')) {
    const content = JSON.parse(opts.body).messages.map(m => m.content).join('\n');
    const report = ((content.match(/<report>\s*([\s\S]*?)\s*<\/report>/) || [null, content])[1] || '').toLowerCase();
    const place = report.includes('oshodi') ? 'Oshodi' : (report.includes('agege') ? 'Agege market' : null);
    const out = /armed|weapon/.test(report)
      ? { is_incident: true, type: 'Safety', severity: 'High', urgency: 'High', location_text: place }
      : { is_incident: true, type: 'Transparency', severity: 'Medium', urgency: 'Medium', location_text: place };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) }, finish_reason: 'stop' }] }), { status: 200 });
  }
  return realFetch(url, opts);
};

const app = require('../src/app');
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
let n = 0;
async function api(method, p, body) {
  n++;
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', 'x-demo-key': process.env.DEMO_KEY, 'x-forwarded-for': `10.1.${Math.floor(n / 250)}.${n % 250}` }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) { /* not json */ }
  return { status: res.status, json };
}
const results = [];
function check(name, ok, detail = '') { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : '   [' + detail + ']')); }

(async () => {
  await api('POST', '/api/demo/reset');
  let r = await api('POST', '/api/reports', { text: 'The public borehole near Oshodi market has not worked for two weeks. Families are buying water from vendors.', source: 'CommunityWatch' });
  let c = r.json.case;
  check('first report is attributed to its source and stays at Signal', c.status === 'Signal' && JSON.stringify(c.sources) === '["CommunityWatch"]', JSON.stringify(c && c.sources));
  const id = c.id;
  r = await api('POST', '/api/reports', { text: 'No running water in the Oshodi market area since early this month; the borehole there is broken.', source: 'WaterAid Field App' });
  c = r.json.case;
  check('a report from a different application joins the same case', c.id === id, 'case ' + c.id);
  check('the case lists both sources, and two independent reports verify it', JSON.stringify(c.sources) === '["CommunityWatch","WaterAid Field App"]' && c.status !== 'Signal', JSON.stringify(c.sources) + ' ' + c.status);
  r = await api('POST', '/api/reports', { text: 'Residents at Oshodi say the borehole is dry again and children walk far for water every day.', source: 'CommunityWatch' });
  c = r.json.case;
  check('the same source is not listed twice', c.id === id && c.sources.filter(s => s === 'CommunityWatch').length === 1, JSON.stringify(c.sources));
  r = await api('GET', `/api/cases/${id}`);
  check('the public read API returns the sources', Array.isArray(r.json.case.sources) && r.json.case.sources.length === 2);
  r = await api('POST', '/api/reports', { text: 'Armed men are gathering near the Agege market entrance, people are running.', source: '<img src=x onerror=alert(1)> Evil "App" ' + 'x'.repeat(80) });
  c = r.json.case;
  const s = (c.sources && c.sources[0]) || '';
  check('a hostile source name is cleaned and limited to 40 characters', s.length > 0 && s.length <= 40 && !/[<>"']/.test(s), JSON.stringify(s));
  await api('POST', '/api/demo/reset');
  r = await api('POST', '/api/reports', { text: 'Armed men are gathering near the Agege market entrance, people are running.' });
  check('a report with no source is accepted and has no sources', r.status === 201 && Array.isArray(r.json.case.sources) && r.json.case.sources.length === 0);
  r = await api('GET', '/api/cases');
  const body = JSON.stringify(r.json);
  check('sources never leak reporter identifiers', !/reporter_hash|notify_to/.test(body));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  server.close();
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + suffix); } catch (_) { /* ignore */ } }
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });

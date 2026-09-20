/**
 * Offline regression suite: NO network, NO API key, NO model tokens.      Run: node scripts/test-offline.js
 * Starts the real app on a random port with a fake Groq/Meta API and a temporary database, then checks the behaviours
 * that matter for trust: verification is model-only, no invented places, scripted routing only for the two demo
 * places, closed cases are not reopened, duplicates are ignored, and the WhatsApp webhook is authenticated.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const dbFile = path.join(os.tmpdir(), `relay-offline-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;
process.env.DEMO_KEY = 'offline-demo-key';
process.env.GROQ_API_KEY = 'offline-groq-key';
process.env.REPORTER_SALT = 'offline-salt';
process.env.NODE_ENV = 'development';
delete process.env.WHATSAPP_APP_SECRET;
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;

// ---- fake Groq + Meta APIs -------------------------------------------------------------------------------------
const { installFakeApis, state } = require('./lib/fake-apis');
installFakeApis();

// ---- app under test ---------------------------------------------------------------------------------------------
const app = require('../src/app');
const classifier = require('../src/classifier');
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
let n = 0;
async function api(method, p, body, extra = {}) {
  n++;
  const headers = { 'Content-Type': 'application/json', 'x-demo-key': process.env.DEMO_KEY, 'x-forwarded-for': `10.0.${Math.floor(n / 250)}.${n % 250}`, ...extra };
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let json = null; try { json = await res.json(); } catch (_) { /* not json */ }
  return { status: res.status, headers: res.headers, json };
}
const send = t => api('POST', '/api/reports', { text: t });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : '   [' + detail + ']')); }
const reset = () => api('POST', '/api/demo/reset');
const waPayload = m => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [m] } }] }] });
const EN = 'There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.';
const PG = 'Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.';

(async () => {
  console.log('--- headers and routes');
  let r = await api('GET', '/api/cases');
  check('Referrer-Policy is not "no-referrer" (map tiles need a Referer)', r.headers.get('referrer-policy') !== 'no-referrer');
  r = await api('POST', '/api/cases', { text: 'x' });
  check('the old POST /api/cases alias no longer crashes with 500', r.status !== 500);

  console.log('--- places');
  for (const t of ['Water pipe burst near my house, this is bad', 'The school gate is broken and nobody cares', 'Two traders are fighting at the bus stop']) {
    await reset(); r = await send(t); const c = r.json.case;
    check('no invented place: "' + t.slice(0, 34) + '"', c && c.location_text === null && c.lat === null, c ? 'place=' + c.location_text : 'no case');
  }
  await reset(); r = await send('Some men are blocking the road at Oshodi bridge and collecting money'); let c = r.json.case;
  check('a stated place is found (Oshodi)', c.location_text === 'Oshodi' && c.lat !== null);
  await reset(); r = await send('Wetin dey happen for Agaigee Market, some men with weapon dey near di bus stop'); c = r.json.case;
  check('a misspelt place is found (Agaigee Market -> Agege market)', c.location_text === 'Agege market');

  console.log('--- scripted demo routing is limited to the two demo places');
  await reset(); r = await send("Two traders are fighting over a stall space at Mile 12 market, it's getting loud"); c = r.json.case;
  check('Mile 12 demo report: Accepted + scripted', c.status === 'Accepted' && c.demo_scripted === true);
  await reset(); r = await send('The borehole at Ijegun primary school has been broken for two weeks, no water'); c = r.json.case;
  check('Ijegun demo report: Assigned + scripted', c.status === 'Assigned' && c.demo_scripted === true);
  await reset(); r = await send('The borehole at Oshodi market has been broken for two weeks, no water'); c = r.json.case;
  check('same kind of report elsewhere stays at Signal', c.status === 'Signal' && c.demo_scripted === false);
  await reset(); r = await send('Water pipe burst near my house, this is bad'); c = r.json.case;
  check('a report with no place stays at Signal and has no action', c.status === 'Signal' && c.action === null);

  console.log('--- lifecycle and verification (model only)');
  await reset(); r = await send(EN); c = r.json.case; const id1 = c.id;
  check('lone report: Signal, confidence <= 45', c.status === 'Signal' && c.confidence_score <= 45);
  r = await send(PG); c = r.json.case;
  check('second independent report merges and reaches Accepted', c.id === id1 && c.status === 'Accepted');
  await api('POST', `/api/cases/${id1}/advance`, {}); r = await api('POST', `/api/cases/${id1}/advance`, {});
  check('advanced to Claimed Resolved', r.json.case.status === 'Claimed Resolved');
  state.failGroq = true;
  r = await api('POST', `/api/cases/${id1}/verify`, { text: 'The area is calm now, shops have reopened' });
  check('model unavailable -> HTTP 503 (no keyword fallback)', r.status === 503, 'status=' + r.status);
  state.failGroq = false;
  r = await api('GET', `/api/cases/${id1}`);
  check('the case is unchanged after the failed verification', r.json.case.status === 'Claimed Resolved');
  state.confirmsAsString = true;
  r = await api('POST', `/api/cases/${id1}/verify`, { text: 'The area is calm now, shops have reopened' });
  check('the string "false" from the model is not a confirmation', !(r.json && r.json.confirmed === true));
  state.confirmsAsString = false;
  r = await api('POST', `/api/cases/${id1}/verify`, { text: 'It is not calm at all, the men are still there.' });
  check('"not calm" is not confirmed', r.json && r.json.confirmed === false);
  r = await api('POST', `/api/cases/${id1}/verify`, { text: 'Things are back to normal, shops have reopened' });
  check('a genuine confirmation closes the case at confidence 100', r.json.case.status === 'Independently Verified' && r.json.case.closed === true && r.json.case.confidence_score === 100);

  console.log('--- closed cases, duplicates, different places');
  r = await send(EN); c = r.json.case; const id2 = c.id;
  check('a new report after closure creates a NEW case', id2 !== id1 && c.status === 'Signal');
  r = await send(EN);
  check('an identical report is flagged as a duplicate', r.json.duplicate === true);
  r = await api('GET', `/api/cases/${id1}`);
  check('the closed case is untouched', r.json.case.status === 'Independently Verified');
  r = await send('Armed men with weapons are on the road at the market, everybody is running'); c = r.json.case;
  check('a different place named only "market" does NOT merge into the Agege case', c && c.id !== id2, c ? 'merged into ' + c.id : 'no case');

  console.log('--- fallback counter');
  const before = classifier.getFallbackCount();
  state.failGroq = true; r = await send('Some traders are fighting at Ikorodu garage'); state.failGroq = false;
  check('a keyword-fallback classification is counted and flagged', classifier.getFallbackCount() === before + 1 && r.json.case.classified_by === 'fallback');

  console.log('--- WhatsApp webhook');
  process.env.WHATSAPP_ACCESS_TOKEN = 'offline-meta-token'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'offline-phone-id';
  await reset(); state.waSent.length = 0;
  await api('POST', '/webhook', waPayload({ from: '2348000000001', type: 'text', text: { body: 'Water pipe burst at Ijegun, no water for days' } }));
  await sleep(700);
  r = await api('GET', '/api/cases');
  check('WhatsApp text (development, no secret) creates a case', r.json.cases.length === 1);
  check('the WhatsApp receipt says the report is NOT verified yet', state.waSent.length === 1 && /NOT verified yet|assigned to/i.test(state.waSent[0]) && !/verified and logged/i.test(state.waSent[0]));
  await reset(); state.waSent.length = 0;
  await api('POST', '/webhook', waPayload({ from: '2348000000002', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg' } }));
  await sleep(900);
  r = await api('GET', '/api/cases');
  const vc = r.json.cases[0];
  check('WhatsApp voice note creates a case with voice evidence and a transcript', r.json.cases.length === 1 && vc.evidence.some(e => e && e.type === 'voice' && e.transcript));

  process.env.NODE_ENV = 'production';
  await reset();
  r = await api('POST', '/webhook', waPayload({ from: '2348000000003', type: 'text', text: { body: 'Armed men at Oshodi' } }));
  await sleep(400);
  const cs1 = (await api('GET', '/api/cases')).json.cases.length;
  check('production without WHATSAPP_APP_SECRET: webhook POST is refused (403), no case', r.status === 403 && cs1 === 0, 'status=' + r.status);
  process.env.WHATSAPP_APP_SECRET = 'offline-app-secret';
  const raw = JSON.stringify(waPayload({ from: '2348000000004', type: 'text', text: { body: 'Armed men with weapon at Oshodi bridge' } }));
  r = await api('POST', '/webhook', raw, { 'x-hub-signature-256': 'sha256=' + 'a'.repeat(64) });
  await sleep(300);
  check('an invalid signature is refused (403)', r.status === 403);
  const good = 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(raw).digest('hex');
  r = await api('POST', '/webhook', raw, { 'x-hub-signature-256': good });
  await sleep(700);
  const cs2 = (await api('GET', '/api/cases')).json.cases.length;
  check('a correctly signed webhook is accepted and creates a case', r.status === 200 && cs2 === 1, 'status=' + r.status + ' cases=' + cs2);
  process.env.NODE_ENV = 'development'; delete process.env.WHATSAPP_APP_SECRET;

  await reset(); state.waSent.length = 0;
  for (let i = 0; i < 11; i++) await api('POST', '/webhook', waPayload({ from: '2348000000099', type: 'text', text: { body: 'Water pipe burst near house number ' + i } }));
  await sleep(2500);
  check('one sender is limited to 10 messages per 10 minutes (11th ignored)', state.waSent.length === 10, 'replies=' + state.waSent.length);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  server.close();
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + s); } catch (_) { /* ignore */ } }
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });

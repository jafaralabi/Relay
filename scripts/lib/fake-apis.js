/**
 * Shared fake Groq + Meta API interceptor for offline tests and stub demo recording.
 */
const realFetch = global.fetch;

const state = {
  failGroq: false,        // true: every Groq call answers 401
  confirmsAsString: false, // true: the verification model answers {"confirms":"false"} (a string)
  waSent: []
};

const PLACES = ['Agege market', 'Mile 12 market', 'Ijegun', 'Oshodi', 'Ikorodu'];

function classify(text) {
  const t = text.toLowerCase();
  let place = null;
  for (const p of PLACES) if (t.includes(p.toLowerCase().split(' ')[0])) place = p;
  if (t.includes('agaigee')) place = 'Agege market';
  if (!place && /at the market/.test(t)) place = 'market';
  if (/what time|hello/.test(t) && !/armed|fight|weapon/.test(t)) return { is_incident: false, type: 'Transparency', severity: 'Low', urgency: 'Low', location_text: null };
  if (/\b(armed|weapon|weapons|gun|guns|wepon)\b/.test(t)) return { is_incident: true, type: 'Safety', severity: 'High', urgency: 'High', location_text: place };
  if (/fight|traders/.test(t)) return { is_incident: true, type: 'Stability', severity: 'Medium', urgency: 'Medium', location_text: place };
  return { is_incident: true, type: 'Transparency', severity: 'Medium', urgency: 'Medium', location_text: place };
}

function installFakeApis() {
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('graph.facebook.com') && u.endsWith('/messages')) {
      if (opts.body) {
        try {
          const b = JSON.parse(opts.body);
          if (b && b.text && b.text.body) state.waSent.push(b.text.body);
        } catch (_) {}
      }
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
    }
    if (u.includes('graph.facebook.com/v20.0/')) return new Response(JSON.stringify({ url: 'https://media.example/x', mime_type: 'audio/ogg' }), { status: 200 });
    if (u.startsWith('https://media.example/')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    if (u.includes('api.groq.com')) {
      if (state.failGroq) return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 });
      if (u.includes('audio/transcriptions')) return new Response(JSON.stringify({ text: 'Wetin dey happen for Oshodi bridge, some men with weapon dey there.' }), { status: 200 });
      const content = JSON.parse(opts.body).messages.map(m => m.content).join('\n');
      const report = (content.match(/<report>\s*([\s\S]*?)\s*<\/report>/) || [null, content])[1];
      let out;
      if (/verification AI/.test(content)) {
        const yes = /(calm|back to normal|reopened)/i.test(report) && !/not calm|still/i.test(report);
        out = state.confirmsAsString ? { confirms: 'false' } : { confirms: yes };
      } else {
        out = classify(report);
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) }, finish_reason: 'stop' }] }), { status: 200 });
    }
    return realFetch(url, opts);
  };
}

module.exports = {
  installFakeApis,
  classify,
  state
};

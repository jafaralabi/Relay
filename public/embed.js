/*! Relay embeddable widget
 *  A "Report a problem" button that sends reports to a Relay server and lets people track a case.
 *  Usage:  <script src="https://YOUR-RELAY-HOST/embed.js" data-source="YourAppName"></script>
 *  Optional attributes: data-label (button text), data-color (#RRGGBB), data-api (defaults to the host that served this script).
 *  The widget only calls the public API (POST /api/reports, GET /api/cases/{id}); it stores nothing in the browser.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || document.getElementById('relay-embed-host')) return;

  var api = (script.getAttribute('data-api') || new URL(script.src, location.href).origin).replace(/\/+$/, '');
  var source = (script.getAttribute('data-source') || 'Embedded widget').slice(0, 40);
  var label = script.getAttribute('data-label') || 'Report a problem';
  var colorAttr = script.getAttribute('data-color') || '';
  var color = /^#[0-9a-fA-F]{6}$/.test(colorAttr) ? colorAttr : '#1d4ed8';

  var host = document.createElement('div');
  host.id = 'relay-embed-host';
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  function el(tag, props, text) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { e.setAttribute(k, props[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }

  var style = el('style');
  style.textContent = [
    ':host, .wrap { all: initial; }',
    '.wrap { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; }',
    '.fab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; background: ' + color + '; color: #fff; border: 0; border-radius: 999px; padding: 12px 18px; font: 600 15px system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); }',
    '.panel { position: fixed; right: 18px; bottom: 74px; z-index: 2147483000; width: min(360px, calc(100vw - 36px)); background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.25); padding: 14px; font-size: 14px; line-height: 1.45; }',
    '.panel[hidden] { display: none; }',
    '.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 700; }',
    '.x { background: none; border: 0; font-size: 20px; cursor: pointer; line-height: 1; }',
    '.tabs { display: flex; gap: 6px; margin-bottom: 8px; }',
    '.tab { flex: 1; padding: 6px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 8px; cursor: pointer; font: inherit; }',
    '.tab[aria-selected="true"] { background: ' + color + '; color: #fff; border-color: ' + color + '; }',
    'label { display: block; font-weight: 600; margin: 6px 0 3px; }',
    'textarea, input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }',
    'textarea { min-height: 96px; resize: vertical; }',
    '.go { margin-top: 8px; background: ' + color + '; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font: 600 14px system-ui, sans-serif; cursor: pointer; }',
    '.go:disabled { opacity: .6; cursor: wait; }',
    '.hint { color: #475569; font-size: 12px; margin-top: 6px; }',
    '.out { margin-top: 8px; padding: 8px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; }',
    '.out.err { border-color: #b91c1c; } .out.ok { border-color: #047857; }',
    '.row { margin: 2px 0; } .k { color: #475569; }'
  ].join('\n');
  root.appendChild(style);

  var wrap = el('div', { 'class': 'wrap' });
  var fab = el('button', { 'class': 'fab', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'relay-panel' }, label);
  var panel = el('div', { 'class': 'panel', id: 'relay-panel', role: 'dialog', 'aria-label': 'Report a problem', hidden: '' });

  var head = el('div', { 'class': 'head' });
  head.appendChild(el('span', null, 'Report a problem'));
  var closeBtn = el('button', { 'class': 'x', type: 'button', 'aria-label': 'Close' }, '\u00d7');
  head.appendChild(closeBtn);
  panel.appendChild(head);

  var tabs = el('div', { 'class': 'tabs', role: 'tablist' });
  var tabReport = el('button', { 'class': 'tab', type: 'button', role: 'tab', 'aria-selected': 'true' }, 'Report');
  var tabTrack = el('button', { 'class': 'tab', type: 'button', role: 'tab', 'aria-selected': 'false' }, 'Track a case');
  tabs.appendChild(tabReport); tabs.appendChild(tabTrack);
  panel.appendChild(tabs);

  var reportView = el('div');
  reportView.appendChild(el('label', { 'for': 'relay-text' }, 'What is happening, and where?'));
  var textarea = el('textarea', { id: 'relay-text', maxlength: '1000', placeholder: 'Describe the problem, the place, and when it started.' });
  reportView.appendChild(textarea);
  reportView.appendChild(el('div', { 'class': 'hint' }, 'Do not include names or phone numbers. Reports are shared with responders and can be seen by others in masked form.'));
  var sendBtn = el('button', { 'class': 'go', type: 'button' }, 'Send report');
  reportView.appendChild(sendBtn);
  var reportOut = el('div', { 'class': 'out', role: 'status', 'aria-live': 'polite', hidden: '' });
  reportView.appendChild(reportOut);

  var trackView = el('div', { hidden: '' });
  trackView.appendChild(el('label', { 'for': 'relay-id' }, 'Case ID'));
  var idInput = el('input', { id: 'relay-id', placeholder: 'For example RLA-1234', maxlength: '20' });
  trackView.appendChild(idInput);
  var lookBtn = el('button', { 'class': 'go', type: 'button' }, 'Look up');
  trackView.appendChild(lookBtn);
  var trackOut = el('div', { 'class': 'out', role: 'status', 'aria-live': 'polite', hidden: '' });
  trackView.appendChild(trackOut);

  panel.appendChild(reportView);
  panel.appendChild(trackView);
  panel.appendChild(el('div', { 'class': 'hint' }, 'Powered by Relay, open resolution infrastructure. Source: ' + source));
  wrap.appendChild(fab); wrap.appendChild(panel);
  root.appendChild(wrap);

  function show(box, kind, rows) {
    box.hidden = false;
    box.className = 'out ' + kind;
    box.textContent = '';
    rows.forEach(function (r) {
      var d = el('div', { 'class': 'row' });
      if (r.length === 2) { d.appendChild(el('span', { 'class': 'k' }, r[0] + ': ')); d.appendChild(document.createTextNode(r[1])); }
      else d.appendChild(document.createTextNode(r[0]));
      box.appendChild(d);
    });
  }
  function caseRows(c) {
    var rows = [['Case', c.id], ['Status', c.status]];
    if (c.responsible_actor) rows.push(['Owner', c.responsible_actor + (c.sla ? ' (SLA ' + c.sla + ')' : '')]);
    if (c.location_text) rows.push(['Place', c.location_text]);
    if (c.sources && c.sources.length) rows.push(['Sources', c.sources.join(', ')]);
    return rows;
  }
  function setOpen(open) {
    if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    fab.setAttribute('aria-expanded', String(open));
    if (open) (tabReport.getAttribute('aria-selected') === 'true' ? textarea : idInput).focus();
  }
  function selectTab(report) {
    tabReport.setAttribute('aria-selected', String(report));
    tabTrack.setAttribute('aria-selected', String(!report));
    if (report) { reportView.removeAttribute('hidden'); trackView.setAttribute('hidden', ''); }
    else { trackView.removeAttribute('hidden'); reportView.setAttribute('hidden', ''); }
  }

  fab.addEventListener('click', function () { setOpen(panel.hasAttribute('hidden')); });
  closeBtn.addEventListener('click', function () { setOpen(false); fab.focus(); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setOpen(false); fab.focus(); } });
  tabReport.addEventListener('click', function () { selectTab(true); });
  tabTrack.addEventListener('click', function () { selectTab(false); });

  sendBtn.addEventListener('click', function () {
    var text = textarea.value.trim();
    if (!text) { show(reportOut, 'err', [['Please describe the problem.']]); return; }
    sendBtn.disabled = true;
    show(reportOut, '', [['Sending...']]);
    fetch(api + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, source: source }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.status === 429) show(reportOut, 'err', [['Too many reports from this device. Please try again in a few minutes.']]);
        else if (res.ok && res.d.duplicate) show(reportOut, 'ok', [['Relay already has this report, so nothing was duplicated.']].concat(res.d.case ? caseRows(res.d.case) : []));
        else if (res.ok && res.d.case) {
          textarea.value = ''; idInput.value = res.d.case.id;
          show(reportOut, 'ok', [['Sent. Save this case ID to track it.']].concat(caseRows(res.d.case)));
        } else if (res.ok) show(reportOut, 'ok', [[res.d.note || 'This did not look like a problem report.']]);
        else show(reportOut, 'err', [[res.d.error || ('Could not send (HTTP ' + res.status + ').')]]);
      })
      .catch(function () { show(reportOut, 'err', [['Could not reach Relay. Check your connection and try again.']]); })
      .then(function () { sendBtn.disabled = false; });
  });

  lookBtn.addEventListener('click', function () {
    var id = idInput.value.trim();
    if (!/^[A-Za-z0-9-]{3,20}$/.test(id)) { show(trackOut, 'err', [['Enter a case ID like RLA-1234.']]); return; }
    lookBtn.disabled = true;
    show(trackOut, '', [['Looking up...']]);
    fetch(api + '/api/cases/' + encodeURIComponent(id))
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.case) show(trackOut, 'ok', caseRows(res.d.case).concat([['Resolution', res.d.case.resolution || 'Pending']]));
        else if (res.status === 404) show(trackOut, 'err', [['No case with that ID.']]);
        else show(trackOut, 'err', [[res.d.error || ('Lookup failed (HTTP ' + res.status + ').')]]);
      })
      .catch(function () { show(trackOut, 'err', [['Could not reach Relay.']]); })
      .then(function () { lookBtn.disabled = false; });
  });
})();

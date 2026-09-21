const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { installFakeApis } = require('../lib/fake-apis');

// Handle CLI arguments (--help / -h / unknown arguments)
const args = process.argv.slice(2);
const usage = `
Relay Demo Video Recording Script

Usage:
  node scripts/demo-video/record.js [options]

Options:
  -h, --help    Show this usage message and exit

Modes (via DEMO_MODEL environment variable):
  stub (default)  Offline recording using fake model and API responses.
                  Visual marker: Red top banner.
                  Output file: docs/demo/relay-demo-offline.webm
  live            Online recording using live Groq API.
                  Requires GROQ_API_KEY (loaded from env or .env).
                  Output file: docs/demo/relay-demo-live.webm

Environment Variables:
  DEMO_MODEL       Mode selection ('stub' or 'live', default: 'stub')
  GROQ_API_KEY     Groq API key (required in live mode)
  DEMO_PACE_MS     Pause delay in ms for live mode (default: 10000)
`;

if (args.includes('--help') || args.includes('-h')) {
  console.log(usage.trim());
  process.exit(0);
}

if (args.length > 0) {
  console.error(`Unknown option(s): ${args.join(' ')}\n`);
  console.error(usage.trim());
  process.exit(1);
}

const mode = process.env.DEMO_MODEL || 'stub';
const paceMs = parseInt(process.env.DEMO_PACE_MS || '10000', 10);

if (mode === 'live') {
  if (!process.env.GROQ_API_KEY) {
    require('dotenv').config();
  }
  if (!process.env.GROQ_API_KEY) {
    console.error('ERROR: DEMO_MODEL is set to "live" but GROQ_API_KEY is missing from environment.');
    process.exit(1);
  }
}

// Generate random DEMO_KEY per run
const demoKey = 'rec-' + crypto.randomBytes(8).toString('hex');
const dbFile = path.join(os.tmpdir(), `relay-demo-rec-${process.pid}-${Date.now()}.db`);

process.env.DATABASE_PATH = dbFile;
process.env.DEMO_KEY = demoKey;
process.env.NODE_ENV = 'development';
if (!process.env.REPORTER_SALT) process.env.REPORTER_SALT = 'demo-salt';

if (mode === 'stub') {
  installFakeApis();
  process.env.GROQ_API_KEY = 'stub-groq-key';
}

const app = require('../../src/app');

// Texts to use according to storyboard spec
const EN_TEXT = 'There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.';
const PG_TEXT = 'Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.';
const MILE12_TEXT = "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming.";
const IJEGUN_TEXT = 'The borehole at Ijegun primary school has been broken for two weeks, children have no water.';
const OSHODI_TEXT = 'The borehole at Oshodi market has been broken for two weeks, children have no water.';
const PARTNER_1_TEXT = 'The public borehole near Oshodi market has not worked for two weeks. Families are buying water from vendors.';
const PARTNER_2_TEXT = 'No running water in the Oshodi market area since early this month; the borehole there is broken.';
const VERIFY_TEXT = 'Things are back to normal, shops have reopened, and people are walking freely.';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getCardHtml(title, subtitle, extraContent = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1280px;
      height: 720px;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 60px;
      text-align: center;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      color: #38bdf8;
      font-weight: 800;
      font-size: 24px;
      letter-spacing: 2px;
    }
    .title {
      font-size: 42px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 16px;
      line-height: 1.25;
      max-width: 1050px;
    }
    .subtitle {
      font-size: 22px;
      color: #94a3b8;
      max-width: 950px;
      line-height: 1.5;
    }
    .extra {
      margin-top: 30px;
      width: 100%;
      max-width: 1100px;
    }
    /* Three column architecture diagram */
    .cols-3 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .col-card {
      flex: 1;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 24px 18px;
      text-align: left;
    }
    .col-card h3 {
      font-size: 20px;
      color: #38bdf8;
      margin-bottom: 12px;
      font-weight: 700;
      border-bottom: 1px solid #334155;
      padding-bottom: 8px;
    }
    .col-card p {
      font-size: 16px;
      color: #cbd5e1;
      line-height: 1.5;
    }
    .arrow {
      font-size: 28px;
      color: #0284c7;
      font-weight: 800;
    }
    /* Closing bullets */
    .closing-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
      text-align: left;
    }
    .closing-item {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 16px 20px;
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .closing-tag {
      font-weight: 800;
      font-size: 18px;
      color: #38bdf8;
      min-width: 180px;
    }
    .closing-text {
      font-size: 17px;
      color: #e2e8f0;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="brand">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    RELAY
  </div>
  <h1 class="title">${title}</h1>
  ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
  ${extraContent ? `<div class="extra">${extraContent}</div>` : ''}
</body>
</html>`;
}

(async () => {
  const tmpDir = path.join(__dirname, '../../docs/demo/tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Starting Relay demo recording in ${mode.toUpperCase()} mode at ${baseUrl}`);

  let browser;
  let context;
  let page;
  let currentCaption = '';
  const chapterEntries = [];
  let startTime = 0;

  const applyOverlay = async (pg, caption) => {
    if (caption !== undefined) currentCaption = caption;
    try {
      await pg.evaluate(({ isStub, captionText }) => {
        // Top-left stub banner
        let stubBanner = document.getElementById('demo-stub-banner');
        if (isStub) {
          if (!stubBanner) {
            stubBanner = document.createElement('div');
            stubBanner.id = 'demo-stub-banner';
            stubBanner.style.cssText = 'position:fixed; top:12px; left:12px; z-index:999999; background:#991b1b; color:#ffffff; font-family:sans-serif; font-weight:700; font-size:12px; padding:6px 12px; border-radius:6px; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events:none; letter-spacing:0.5px;';
            document.body.appendChild(stubBanner);
          }
          stubBanner.textContent = 'OFFLINE RECORDING - MODEL RESPONSES ARE SIMULATED';
        } else if (stubBanner) {
          stubBanner.remove();
        }

        // Bottom caption banner
        let captionBanner = document.getElementById('demo-caption-banner');
        if (captionText) {
          if (!captionBanner) {
            captionBanner = document.createElement('div');
            captionBanner.id = 'demo-caption-banner';
            captionBanner.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:999999; background:rgba(15, 23, 42, 0.92); color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size:18px; font-weight:600; text-align:center; padding:12px 22px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 10px 25px rgba(0,0,0,0.5); max-width:88%; width:max-content; pointer-events:none; line-height:1.4;';
            document.body.appendChild(captionBanner);
          }
          captionBanner.textContent = captionText;
        } else if (captionBanner) {
          captionBanner.remove();
        }

        // Reserve caption band space by adding padding to body
        let styleEl = document.getElementById('demo-caption-style');
        if (captionText && captionBanner) {
          const bannerHeight = captionBanner.offsetHeight || 60;
          const pad = bannerHeight + 16;
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'demo-caption-style';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = `body { padding-bottom: ${pad}px !important; }`;
        } else if (styleEl) {
          styleEl.remove();
        }
      }, { isStub: mode === 'stub', captionText: currentCaption });
    } catch (_) {
      // Page might be navigating
    }
  };

  const showCaption = async (pg, text, extraHoldMs = 0) => {
    currentCaption = text;
    await applyOverlay(pg, text);
    const minMs = Math.max(3000, Math.ceil((text.length / 14) * 1000));
    await sleep(minMs + extraHoldMs);
  };

  const scrollToForm = async (pg) => {
    try {
      await pg.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      await sleep(400);
    } catch (_) {}
  };

  const scrollToWorkspace = async (pg) => {
    try {
      await pg.evaluate(() => {
        const grid = document.querySelector('.workspace-grid') || document.querySelector('#feed-heading');
        if (grid) {
          const top = grid.getBoundingClientRect().top + window.scrollY - 12;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      });
      await sleep(400);
    } catch (_) {}
  };

  const scrollReceiptToBottom = async (pg) => {
    try {
      await pg.evaluate(() => {
        const container = document.querySelector('#receipt-container');
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
      });
      await sleep(400);
    } catch (_) {}
  };

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: tmpDir,
        size: { width: 1280, height: 720 }
      }
    });

    page = await context.newPage();
    page.on('domcontentloaded', () => applyOverlay(page, currentCaption));

    const stepsAsserted = [];
    startTime = Date.now();

    // Helper for executing a step with timeout and retry
    async function executeStep(stepNum, stepTitle, stepFn) {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(elapsedSec / 60);
      const s = String(elapsedSec % 60).padStart(2, '0');
      const timeStr = `${m}:${s}`;
      chapterEntries.push(`${timeStr} ${stepTitle}`);

      console.log(`[Step ${stepNum}] (${timeStr}) ${stepTitle}`);
      let attempts = 0;
      const maxAttempts = (mode === 'live' && [6, 7, 9, 10, 12, 13].includes(stepNum)) ? 2 : 1;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          await stepFn();
          stepsAsserted.push(`Step ${stepNum}: ${stepTitle}`);
          return;
        } catch (err) {
          if (attempts < maxAttempts) {
            console.warn(`[Step ${stepNum}] Attempt 1 failed (possible rate limit). Retrying in 30 seconds... Error: ${err.message}`);
            await sleep(30000);
          } else {
            throw new Error(`Step ${stepNum} ("${stepTitle}") failed: ${err.message}`);
          }
        }
      }
    }

    // Helper to poll assertion
    async function assertWithTimeout(fn, description, timeoutMs = 20000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          if (await fn()) return true;
        } catch (_) {}
        await sleep(500);
      }
      throw new Error(`Assertion failed within ${timeoutMs}ms: ${description}`);
    }

    // --- STEP 1: Title Card ---
    await executeStep(1, 'Title card', async () => {
      const html = getCardHtml(
        'Relay: open resolution infrastructure for civic reporting in Africa',
        'Any source in. One verified case. Accountable responders out.'
      );
      await page.setContent(html);
      await showCaption(page, 'Relay: open resolution infrastructure for civic reporting in Africa. Any source in. One verified case. Accountable responders out.', 500);
    });

    // --- STEP 2: Problem Card ---
    await executeStep(2, 'Problem card', async () => {
      const html = getCardHtml(
        'The Gap in Civic Tech',
        'Civic tech captures reports. But each tool is an island, nobody is bound to act, nothing proves what happened, and no one checks.'
      );
      await page.setContent(html);
      await showCaption(page, 'Civic tech captures reports. But each tool is an island, nobody is bound to act, nothing proves what happened, and no one checks.', 500);
    });

    // --- STEP 3: "How it plugs together" Card ---
    await executeStep(3, 'How it plugs together', async () => {
      const extraHtml = `
        <div class="cols-3">
          <div class="col-card">
            <h3>Sources</h3>
            <p>Community apps, aggregators, NGO tools, WhatsApp and voice</p>
          </div>
          <div class="arrow">&rarr;</div>
          <div class="col-card">
            <h3>RELAY</h3>
            <p>One case, matching, corroboration, verification, receipt</p>
          </div>
          <div class="arrow">&rarr;</div>
          <div class="col-card">
            <h3>Responders & Oversight</h3>
            <p>Agencies, NGOs, community responders, regulators</p>
          </div>
        </div>
      `;
      const html = getCardHtml(
        'How It Plugs Together',
        '',
        extraHtml
      );
      await page.setContent(html);
      await showCaption(page, 'Sources send signals in. Relay matches, verifies and routes them. Responders and regulators act and oversee. Every partner keeps its own front end.', 500);
    });

    // --- STEP 4: /demo.html: enter key, click Reset ---
    await executeStep(4, 'Reset database', async () => {
      await page.goto(`${baseUrl}/demo.html`);
      await page.fill('#demo-key-input', demoKey);
      await page.click('#btn-reset');

      await assertWithTimeout(async () => {
        const logText = await page.textContent('#response-log');
        return logText.includes('POST /api/demo/reset') && logText.includes('HTTP 200');
      }, '#response-log shows successful reset');

      await showCaption(page, 'Demo controls reset the database.', 500);
    });

    // --- STEP 5: Go to / ---
    await executeStep(5, 'Dashboard initial state', async () => {
      await page.goto(`${baseUrl}/`);

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        return feedText.includes('No reports yet');
      }, 'Empty state "No reports yet" visible on feed');

      const captionText = mode === 'stub'
        ? 'Everything from here runs the real app; the AI responses are simulated.'
        : 'An empty system. Everything from here is a real run of the app.';

      await scrollToWorkspace(page);
      await showCaption(page, captionText, 500);
    });

    // --- STEP 6: English Agege report ---
    await executeStep(6, 'English Agege report', async () => {
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', EN_TEXT, { delay: 20 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedback = await page.textContent('#form-feedback');
        const feedText = await page.textContent('#case-feed-list');
        return feedback.includes('Report processed') && feedText.includes('Signal') && feedText.includes('Agege market');
      }, 'Feed shows 1 case with Signal at Agege market');

      const firstCard = page.locator('#case-feed-list .case-item').first();
      await firstCard.click();

      await assertWithTimeout(async () => {
        const receiptText = await page.textContent('#receipt-container');
        return receiptText.includes('(proposed)') &&
               receiptText.includes('Awaiting corroboration') &&
               receiptText.includes('Sources: Relay web (1 source)');
      }, 'Receipt shows "(proposed)", "Awaiting corroboration", and "Sources: Relay web (1 source)"');

      await scrollToWorkspace(page);
      await showCaption(page, 'A community app reports armed men near Agege market. The AI classifies it: Safety, High. One report is never enough, so it stays at Signal.', 500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 7: Pidgin report ---
    await executeStep(7, 'Pidgin corroborating report', async () => {
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', PG_TEXT, { delay: 20 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        return feedText.includes('Accepted');
      }, 'Case status updated to Accepted');

      const firstCard = page.locator('#case-feed-list .case-item').first();
      await firstCard.click();

      await assertWithTimeout(async () => {
        const receiptText = await page.textContent('#receipt-container');
        return receiptText.includes('2 independent reports') &&
               receiptText.includes('30 minutes') &&
               receiptText.includes('22 minutes after report');
      }, 'Receipt shows "2 independent reports", "30 minutes", "22 minutes after report"');

      await scrollToWorkspace(page);
      await scrollReceiptToBottom(page);
      await showCaption(page, 'A second report, in Nigerian Pidgin, corroborates it. Verified and assigned to a named owner with a 30-minute SLA. The responder is simulated and labelled.', 500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 8: Advance case twice ---
    await executeStep(8, 'Responder claims resolution', async () => {
      const res = await fetch(`${baseUrl}/api/cases`);
      const data = await res.json();
      const caseId = data.cases[0].id;

      await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-key': demoKey },
        body: JSON.stringify({})
      });
      await fetch(`${baseUrl}/api/cases/${caseId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-key': demoKey },
        body: JSON.stringify({})
      });

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const badgeElem = await page.locator('.status-stage-violet').count();
        return feedText.includes('Claimed Resolved') && badgeElem > 0;
      }, 'Case shows Claimed Resolved with violet badge class');

      await scrollToWorkspace(page);
      await showCaption(page, 'The responder claims it resolved. Violet: a claim is not a verification.', 500);
    });

    // --- STEP 9: Verify case ---
    await executeStep(9, 'Independent verification & Trust Receipt', async () => {
      const res = await fetch(`${baseUrl}/api/cases`);
      const data = await res.json();
      const caseId = data.cases[0].id;

      await fetch(`${baseUrl}/api/cases/${caseId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-key': demoKey },
        body: JSON.stringify({ text: VERIFY_TEXT })
      });

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Independently Verified') &&
               feedText.includes('100') &&
               receiptText.includes('Closed') && receiptText.includes('Yes');
      }, 'Case shows Independently Verified, Closed Yes, confidence 100');

      await scrollToWorkspace(page);
      await scrollReceiptToBottom(page);

      await showCaption(page, 'A third community member confirms it. The model checks the confirmation. The case closes with a Trust Receipt.', 500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 10: Reset & Submit Mile 12, Ijegun, Oshodi ---
    await executeStep(10, 'Scripted demo routing comparison', async () => {
      // POST /api/demo/reset
      await fetch(`${baseUrl}/api/demo/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-key': demoKey }
      });

      // 10a: Mile 12 text
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', MILE12_TEXT, { delay: 20 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Accepted') && /Scripted demo routing/i.test(receiptText);
      }, 'Mile 12 report is Accepted + Scripted demo routing badge');

      await scrollToWorkspace(page);
      await showCaption(page, 'A market dispute routes to a trained mediator; scripted routing, and the badge says so.', 500);
      if (mode === 'live') await sleep(paceMs);

      // 10b: Ijegun text
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', IJEGUN_TEXT, { delay: 20 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Assigned') && /Scripted demo routing/i.test(receiptText);
      }, 'Ijegun report is Assigned + Scripted demo routing badge');

      await scrollToWorkspace(page);
      await showCaption(page, 'A broken borehole routes to a local government works officer.', 500);
      if (mode === 'live') await sleep(paceMs);

      // 10c: Oshodi borehole text
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', OSHODI_TEXT, { delay: 20 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Signal') && !/Scripted demo routing/i.test(receiptText);
      }, 'Oshodi report is Signal with no Scripted demo routing badge');

      await scrollToWorkspace(page);
      await showCaption(page, 'The same kind of report elsewhere waits at Signal for a second source.', 500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 11: Select each card on map view ---
    await executeStep(11, 'Interactive map & stage icons', async () => {
      await scrollToWorkspace(page);
      const cards = page.locator('#case-feed-list .case-item');
      const count = await cards.count();

      for (let i = 0; i < count; i++) {
        await cards.nth(i).click();
        await sleep(1200);
        await assertWithTimeout(async () => {
          const selectedMarker = await page.locator('.leaflet-marker-icon').count();
          return selectedMarker > 0;
        }, `Selected marker visible for card ${i + 1}`);
      }

      await showCaption(page, 'Every stage has its own icon, so meaning never depends on colour alone.', 500);
    });

    // --- STEP 12: Partner App Simulator ---
    await executeStep(12, 'Partner app simulator & multi-source merge', async () => {
      // POST /api/demo/reset
      await fetch(`${baseUrl}/api/demo/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-key': demoKey }
      });

      await page.goto(`${baseUrl}/partner-demo.html`);

      // 12a: CommunityWatch send partner report 1
      await page.selectOption('#app', 'CommunityWatch');
      await page.fill('#text', PARTNER_1_TEXT);
      await page.click('#send');

      let case1Id = '';
      await assertWithTimeout(async () => {
        const resultText = await page.textContent('#result');
        if (resultText.includes('Signal') && resultText.includes('CommunityWatch')) {
          const m = resultText.match(/Relay case:\s*([A-Z0-9-]+)/);
          if (m) case1Id = m[1];
          return true;
        }
        return false;
      }, '#result shows status Signal and CommunityWatch');

      // 12b: WaterAid Field App send partner report 2
      await page.selectOption('#app', 'WaterAid Field App');
      await page.fill('#text', PARTNER_2_TEXT);
      await page.click('#send');

      await assertWithTimeout(async () => {
        const resultText = await page.textContent('#result');
        return resultText.includes(case1Id) &&
               !resultText.includes('Status: Signal') &&
               resultText.includes('CommunityWatch') &&
               resultText.includes('WaterAid Field App');
      }, '#result shows same case ID, non-Signal status, and both sources');

      // 12c: Market Traders Union send partner report 1 again
      await page.selectOption('#app', 'Market Traders Union');
      await page.fill('#text', PARTNER_1_TEXT);
      await page.click('#send');

      await assertWithTimeout(async () => {
        const resultText = await page.textContent('#result');
        return resultText.includes('Relay recognised this as a report it already has');
      }, '#result indicates report is already recognized as duplicate');

      // 12d: Go to /, click case card, scroll to receipt
      await page.goto(`${baseUrl}/`);
      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        return feedText.includes('Oshodi');
      }, 'Case card visible on dashboard');

      const card = page.locator('#case-feed-list .case-item').first();
      await card.click();

      await assertWithTimeout(async () => {
        const receiptText = await page.textContent('#receipt-container');
        return receiptText.includes('Sources: CommunityWatch, WaterAid Field App (2 sources)') &&
               receiptText.includes('2 independent reports');
      }, 'Receipt shows "Sources: CommunityWatch, WaterAid Field App (2 sources)" and "2 independent reports"');

      await scrollToWorkspace(page);
      await scrollReceiptToBottom(page);
      await showCaption(page, 'Now different applications, simulated here. Two report the same broken borehole. Relay recognises one problem, merges them into a single case, lists both sources, and verifies it because two independent sources agree. A third sending the same report is recognised as a duplicate.', 500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 13: Embeddable Widget ---
    await executeStep(13, 'Embeddable widget', async () => {
      // Rely on step 12 reset as per spec
      await page.goto(`${baseUrl}/embed-demo.html`);

      // Click button.fab inside shadow root
      const fab = page.locator('button.fab');
      await fab.click();

      // Fill textarea#relay-text
      await page.fill('textarea#relay-text', IJEGUN_TEXT);

      // Click send button (first button.go)
      const sendBtn = page.locator('button.go').first();
      await sendBtn.click();

      let createdCaseId = '';
      await assertWithTimeout(async () => {
        const outText = await page.locator('.out').first().textContent();
        if (outText.includes('Sent. Save this case ID to track it.') &&
            outText.includes('Sources: SunBright Solar') &&
            !outText.includes('Status: Signal')) {
          const m = outText.match(/Case:\s*([A-Z0-9-]+)/);
          if (m) createdCaseId = m[1];
          return true;
        }
        return false;
      }, 'Widget shows Sent, Sources: SunBright Solar, non-Signal status');

      // Click "Track a case" tab
      const trackTab = page.locator('.tab', { hasText: 'Track a case' });
      await trackTab.click();

      // Click "Look up" button (second button.go)
      const lookupBtn = page.locator('button.go').nth(1);
      await lookupBtn.click();

      await assertWithTimeout(async () => {
        const outText = await page.locator('.out').nth(1).textContent();
        return outText.includes('Resolution: Pending') || outText.includes('Status: Assigned') || outText.includes('Assigned');
      }, 'Widget lookup shows Resolution: Pending / case status details');

      await showCaption(page, 'A last-mile service embeds Relay with one line. Its customers get a Report button and a case tracker. Their reports join the shared record under the partner\'s name.', 500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 14: Developers Page & Open API ---
    await executeStep(14, 'Developers page & open API', async () => {
      await page.goto(`${baseUrl}/`);
      const devLink = page.locator('a', { hasText: 'Developers & API' });
      await devLink.click();

      await page.waitForURL('**/developers.html');

      // Assert #base non-empty
      await assertWithTimeout(async () => {
        const baseVal = await page.textContent('#base');
        return baseVal.trim().length > 0;
      }, '#base is non-empty');

      const snippet0 = await page.textContent('#snippet');

      // Click PowerShell tab
      const psTab = page.locator('.tabs button[data-tab="ps"]');
      await psTab.click();
      await sleep(300);
      const snippet1 = await page.textContent('#snippet');

      // Click JavaScript tab
      const jsTab = page.locator('.tabs button[data-tab="js"]');
      await jsTab.click();
      await sleep(300);
      const snippet2 = await page.textContent('#snippet');

      if (snippet0 === snippet1 || snippet1 === snippet2) {
        throw new Error('#snippet did not change between language tabs');
      }

      // Scroll to endpoint table
      await page.evaluate(() => {
        document.querySelector('#endpoints').scrollIntoView({ behavior: 'smooth' });
      });
      await sleep(500);

      await assertWithTimeout(async () => {
        const rowCount = await page.locator('#endpoints tbody tr').count();
        const roadmapTagCount = await page.locator('#endpoints .tag.roadmap').count();
        return rowCount === 12 && roadmapTagCount > 0;
      }, '12 rows in #endpoints table with at least one ROADMAP tag');

      // Scroll to Embed Relay in your product
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Embed Relay'));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
      await sleep(500);

      await assertWithTimeout(async () => {
        const embedCode = await page.textContent('#embedSnippet');
        return embedCode.includes('embed.js');
      }, '#embedSnippet contains embed.js');

      // Click #tryBtn
      await page.click('#tryBtn');

      await assertWithTimeout(async () => {
        const tryNote = await page.textContent('#tryNote');
        return tryNote.includes('HTTP 200');
      }, '#tryNote contains "HTTP 200"');

      // Scroll to Partner access
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Partner access'));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
      await sleep(500);

      // Type "CommunityWatch" in #org, click #genBtn
      await page.fill('#org', 'CommunityWatch');
      await page.click('#genBtn');

      await assertWithTimeout(async () => {
        const keyVal = await page.textContent('#keyVal');
        return keyVal.startsWith('rk_preview_');
      }, '#keyVal starts with rk_preview_');

      await showCaption(page, 'The API is open and documented: endpoints with built and roadmap tags, examples in three languages, and a live call. Partner keys are a preview; today the API needs no key. Keys, responder accounts and regulator views are on the roadmap.', 500);
    });

    // --- STEP 15: Closing Card ---
    await executeStep(15, 'Closing card', async () => {
      const extraHtml = `
        <div class="closing-grid">
          <div class="closing-item">
            <span class="closing-tag">Real</span>
            <span class="closing-text">Intake, AI classification, matching across sources, verification, the receipt, the open API and the widget.</span>
          </div>
          <div class="closing-item">
            <span class="closing-tag">Simulated & labelled</span>
            <span class="closing-text">Responders and partner apps.</span>
          </div>
          <div class="closing-item">
            <span class="closing-tag">Next</span>
            <span class="closing-text">Partner keys, responder accounts, more languages, federation. A stitch in time saves nine. Relay is how the stitch gets made.</span>
          </div>
        </div>
      `;
      const html = getCardHtml(
        'Relay: Open Resolution Infrastructure',
        '',
        extraHtml
      );
      await page.setContent(html);
      await showCaption(page, 'Real: intake, AI classification, matching across sources, verification, the receipt, the open API and the widget. Simulated and labelled: responders and partner apps. Next: partner keys, responder accounts, more languages, federation. A stitch in time saves nine. Relay is how the stitch gets made.', 1000);
    });

    console.log('\n====================================================');
    console.log('       ALL STORYBOARD STEPS PASSED SUCCESSFULLY');
    console.log('====================================================');
    console.log('Asserted steps:');
    stepsAsserted.forEach(s => console.log('  - ' + s));

    // Finalize video
    await page.close();
    await context.close();
    await browser.close();

    // Find recorded video in tmpDir
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.webm'));
    if (files.length === 0) {
      throw new Error('No recorded video file found in tmp directory.');
    }

    const recFile = path.join(tmpDir, files[0]);
    const targetFileName = mode === 'stub' ? 'relay-demo-offline.webm' : 'relay-demo-live.webm';
    const docsDemoDir = path.join(__dirname, '../../docs/demo');
    fs.mkdirSync(docsDemoDir, { recursive: true });

    const targetPath = path.join(docsDemoDir, targetFileName);

    fs.copyFileSync(recFile, targetPath);

    // Clean up tmp files
    files.forEach(f => fs.unlinkSync(path.join(tmpDir, f)));

    // Write chapter file docs/demo/relay-demo-chapters.txt
    const chapterPath = path.join(docsDemoDir, 'relay-demo-chapters.txt');
    fs.writeFileSync(chapterPath, chapterEntries.join('\n') + '\n', 'utf8');
    console.log(`Chapter file written to: ${chapterPath}`);

    const stats = fs.statSync(targetPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\nRecording finalized successfully: ${targetPath}`);
    console.log(`File size: ${sizeMb} MB`);

    if (stats.size > 200 * 1024 * 1024) {
      console.warn('WARNING: Video file exceeds 200 MB.');
    }

    server.close();
    ['', '-wal', '-shm'].forEach(s => {
      try { fs.unlinkSync(dbFile + s); } catch (_) {}
    });

    process.exit(0);

  } catch (err) {
    console.error('\nRECORDING ERROR:', err.message);
    if (context) {
      try { await context.close(); } catch (_) {}
    }
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    // Delete partial video files
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.webm'));
      files.forEach(f => fs.unlinkSync(path.join(tmpDir, f)));
    }
    server.close();
    ['', '-wal', '-shm'].forEach(s => {
      try { fs.unlinkSync(dbFile + s); } catch (_) {}
    });
    process.exit(1);
  }
})();

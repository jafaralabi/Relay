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
const VERIFY_TEXT = 'Things are back to normal, shops have reopened, and people are walking freely.';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getCardHtml(title, subtitle, bullets = []) {
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
      margin-bottom: 30px;
      color: #38bdf8;
      font-weight: 800;
      font-size: 24px;
      letter-spacing: 2px;
    }
    .title {
      font-size: 46px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 20px;
      line-height: 1.2;
      max-width: 1000px;
    }
    .subtitle {
      font-size: 24px;
      color: #94a3b8;
      max-width: 900px;
      line-height: 1.5;
    }
    .bullets {
      margin-top: 36px;
      text-align: left;
      display: inline-block;
      max-width: 900px;
    }
    .bullet-item {
      font-size: 22px;
      margin-bottom: 16px;
      line-height: 1.4;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .bullet-tag {
      font-weight: 700;
      color: #38bdf8;
      min-width: 120px;
    }
    .bullet-text {
      color: #e2e8f0;
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
  ${bullets.length > 0 ? `
    <div class="bullets">
      ${bullets.map(b => `
        <div class="bullet-item">
          <span class="bullet-tag">${b.tag}:</span>
          <span class="bullet-text">${b.text}</span>
        </div>
      `).join('')}
    </div>
  ` : ''}
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
            captionBanner.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:999999; background:rgba(15, 23, 42, 0.92); color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size:20px; font-weight:600; text-align:center; padding:14px 24px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 10px 25px rgba(0,0,0,0.5); max-width:88%; width:max-content; pointer-events:none; line-height:1.4;';
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

    // Helper for executing a step with timeout and retry
    async function executeStep(stepNum, stepName, stepFn) {
      console.log(`[Step ${stepNum}] ${stepName}`);
      let attempts = 0;
      const maxAttempts = (mode === 'live' && [5, 6, 8, 9, 10, 11].includes(stepNum)) ? 2 : 1;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          await stepFn();
          stepsAsserted.push(`Step ${stepNum}: ${stepName}`);
          return;
        } catch (err) {
          if (attempts < maxAttempts) {
            console.warn(`[Step ${stepNum}] Attempt 1 failed (possible rate limit). Retrying in 30 seconds... Error: ${err.message}`);
            await sleep(30000);
          } else {
            throw new Error(`Step ${stepNum} ("${stepName}") failed: ${err.message}`);
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
    await executeStep(1, 'Title Card', async () => {
      const html = getCardHtml(
        'Relay: from signal to proof',
        'Track: Safety, Reporting and Protection'
      );
      await page.setContent(html);
      await showCaption(page, 'Relay: from signal to proof. Track: Safety, Reporting and Protection.', 1500);
    });

    // --- STEP 2: Problem Card ---
    await executeStep(2, 'Problem Card', async () => {
      const html = getCardHtml(
        'The Gap in Civic Tech',
        'Civic tech captures reports. Almost none closes the loop: nobody is bound to act, nothing proves what happened, and no one checks.'
      );
      await page.setContent(html);
      await showCaption(page, 'Civic tech captures reports. Almost none closes the loop: nobody is bound to act, nothing proves what happened, and no one checks.', 1000);
    });

    // --- STEP 3: Open /demo.html, type key, reset ---
    await executeStep(3, 'Open /demo.html & Reset', async () => {
      await page.goto(`${baseUrl}/demo.html`);
      await page.fill('#demo-key-input', demoKey);
      await page.click('#btn-reset');

      await assertWithTimeout(async () => {
        const logText = await page.textContent('#response-log');
        return logText.includes('POST /api/demo/reset') && logText.includes('HTTP 200');
      }, 'Response log shows successful reset HTTP 200');

      await showCaption(page, 'Demo controls (key protected) reset the database.', 1500);
    });

    // --- STEP 4: Go to / ---
    await executeStep(4, 'Go to Main App /', async () => {
      await page.goto(`${baseUrl}/`);

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        return feedText.includes('No reports yet');
      }, 'Empty state "No reports yet" visible on feed');

      const captionText = mode === 'stub'
        ? 'Everything from here runs the real app; the AI responses are simulated.'
        : 'An empty system. Everything from here is a real run of the app.';

      await scrollToWorkspace(page);
      await showCaption(page, captionText, 1500);
    });

    // --- STEP 5: English report ---
    await executeStep(5, 'Submit English Report', async () => {
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', EN_TEXT, { delay: 25 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedback = await page.textContent('#form-feedback');
        const feedText = await page.textContent('#case-feed-list');
        return feedback.includes('Report processed') && feedText.includes('Signal') && feedText.includes('Agege market');
      }, 'Form feedback contains "Report processed", feed has 1 case with Signal @ Agege market');

      // Click the case card to ensure receipt is open
      const firstCard = page.locator('#case-feed-list .case-item').first();
      await firstCard.click();

      await assertWithTimeout(async () => {
        const receiptText = await page.textContent('#receipt-container');
        return receiptText.includes('(proposed)') &&
               receiptText.includes('Awaiting corroboration') &&
               receiptText.includes('Closed') && receiptText.includes('No');
      }, 'Receipt shows "(proposed)", "Awaiting corroboration", and "Closed" "No"');

      await scrollToWorkspace(page);
      await showCaption(page, 'A report arrives. The AI classifies it: Safety, High severity, place Agege market. One report is never enough, so it stays at Signal.', 1500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 6: Pidgin report ---
    await executeStep(6, 'Submit Pidgin Corroborating Report', async () => {
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', PG_TEXT, { delay: 25 });
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
               receiptText.includes('22 minutes after report') &&
               /SIMULATED RESPONDER TIMELINE/i.test(receiptText);
      }, 'Receipt shows "2 independent reports", "30 minutes", "22 minutes after report", and "SIMULATED RESPONDER TIMELINE"');

      await scrollToWorkspace(page);
      await scrollReceiptToBottom(page);
      await showCaption(page, "A second person reports in Nigerian Pidgin. Two independent reports verify it and it is assigned to a named actor with a 30-minute SLA. The responder's acceptance is simulated and labelled.", 1500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 7: Advance case twice ---
    await executeStep(7, 'Advance Case (In Progress -> Claimed Resolved)', async () => {
      // Find case id
      const res = await fetch(`${baseUrl}/api/cases`);
      const data = await res.json();
      const caseId = data.cases[0].id;

      // Advance twice
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
      }, 'Case shows Claimed Resolved with violet badge class', 15000);

      await scrollToWorkspace(page);
      await showCaption(page, 'The responder acts and claims it resolved. Violet: a claim is not a verification.', 5000);
    });

    // --- STEP 8: Verify case ---
    await executeStep(8, 'Third-Party Verification', async () => {
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

      await showCaption(page, 'A third community member confirms the area is calm. The model checks the confirmation; if it were unavailable, nothing would change. The case is closed with a Trust Receipt.', 6000);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 9: Reset & Submit Mile 12 ---
    await executeStep(9, 'Scripted Routing - Mile 12 Market', async () => {
      await fetch(`${baseUrl}/api/demo/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-key': demoKey }
      });

      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', MILE12_TEXT, { delay: 25 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Accepted') &&
               /SCRIPTED DEMO ROUTING/i.test(feedText + receiptText) &&
               receiptText.includes('Trained community mediator') &&
               receiptText.includes('24 hours');
      }, 'Status Accepted, badge "SCRIPTED DEMO ROUTING", actor "Trained community mediator", SLA 24 hours');

      await scrollToWorkspace(page);
      await scrollReceiptToBottom(page);
      await showCaption(page, 'A market dispute routes to a trained mediator. This demo scenario uses scripted routing, and the badge says so.', 1500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 10: Submit Ijegun ---
    await executeStep(10, 'Scripted Routing - Ijegun Primary School', async () => {
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', IJEGUN_TEXT, { delay: 25 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Assigned') &&
               /SCRIPTED DEMO ROUTING/i.test(feedText + receiptText) &&
               receiptText.includes('Local government works officer') &&
               receiptText.includes('72 hours');
      }, 'Status Assigned, actor "Local government works officer", SLA 72 hours, badge "SCRIPTED DEMO ROUTING"');

      await scrollToWorkspace(page);
      await scrollReceiptToBottom(page);
      await showCaption(page, 'A broken borehole routes to a local government works officer.', 1500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 11: Submit Oshodi ---
    await executeStep(11, 'Normal Routing - Oshodi Market', async () => {
      await scrollToForm(page);
      await page.fill('#report-text', '');
      await page.type('#report-text', OSHODI_TEXT, { delay: 25 });
      await page.click('#submit-report-btn');

      await assertWithTimeout(async () => {
        const feedText = await page.textContent('#case-feed-list');
        const receiptText = await page.textContent('#receipt-container');
        return feedText.includes('Signal') &&
               !/SCRIPTED DEMO ROUTING/i.test(receiptText) &&
               receiptText.includes('Signal');
      }, 'Oshodi report is Signal without SCRIPTED DEMO ROUTING badge');

      await scrollToWorkspace(page);
      await showCaption(page, 'The same kind of report at any other place follows the normal rules: it waits at Signal for a second independent report.', 1500);
      if (mode === 'live') await sleep(paceMs);
    });

    // --- STEP 12: Hold map & click each card ---
    await executeStep(12, 'Interactive Map & Status Icons', async () => {
      await scrollToWorkspace(page);
      const cards = page.locator('#case-feed-list .case-item');
      const count = await cards.count();

      for (let i = 0; i < count; i++) {
        await cards.nth(i).click();
        await scrollReceiptToBottom(page);
        await sleep(2000);
        await assertWithTimeout(async () => {
          const selectedMarker = await page.locator('.leaflet-marker-icon').count();
          return selectedMarker > 0;
        }, `Selected marker visible for card ${i + 1}`);
      }

      await showCaption(page, 'Every stage has its own icon, so meaning never depends on colour alone.', 1500);
    });

    // --- STEP 13: Closing Card ---
    await executeStep(13, 'Closing Card', async () => {
      const html = getCardHtml(
        'Relay: Proof-of-Trust Architecture',
        'System Breakdown & Next Steps',
        [
          { tag: 'Real', text: 'Intake, AI classification, corroboration, assignment, independent verification, the receipt.' },
          { tag: 'Simulated', text: 'Responder behaviour timeline (clearly labelled).' },
          { tag: 'Next', text: 'Real responders, live WhatsApp integration, multi-language support. Adding a city is mostly data.' }
        ]
      );
      await page.setContent(html);
      await showCaption(page, 'Real: intake, AI classification, corroboration, assignment, independent verification, the receipt. Simulated and labelled: responder behaviour. Next: real responders, live WhatsApp, more languages. Adding a city is mostly data.', 2500);
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

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { transcribeAudio } = require('./transcribe');

// GET /webhook — Meta verification handshake
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
    console.log('[WhatsApp Webhook] Handshake verified successfully.');
    return res.status(200).send(challenge);
  } else {
    console.warn('[WhatsApp Webhook] Handshake verification failed.');
    return res.sendStatus(403);
  }
});

/**
 * What the reporter is told will happen next, based on the case's real status.
 */
function whatHappensNext(c) {
  const actor = c.responsible_actor || 'the responsible actor';
  const sla = c.sla || 'the agreed SLA';
  switch (c.status) {
    case 'Signal':
    case 'Corroborating':
      return `Your report has been received but is NOT verified yet. It needs at least one more independent report about the same place. If it is verified it will be assigned to ${actor} (SLA: ${sla}).`;
    case 'Verified':
      return `Your report has been verified by independent reports and is being assigned to ${actor} (SLA: ${sla}).`;
    case 'Assigned':
    case 'Accepted':
    case 'In Progress':
      return `Your report has been assigned to ${actor}, who works to the ${sla} SLA.${c.demo_scripted ? ' (Scripted demo routing.)' : ''}`;
    case 'Claimed Resolved':
      return 'The responder says this is resolved. Relay is waiting for an independent confirmation before closing it.';
    case 'Independently Verified':
      return 'This case was resolved and independently confirmed.';
    default:
      return 'Your report has been logged.';
  }
}

/**
 * Format receipt text message for WhatsApp response.
 */
function buildReceiptText(result) {
  if (!result || !result.case) {
    return `Relay System Notice\n-------------------\nThank you for contacting Relay. Your report was received, but no actionable incident was created.\n\nNote: ${result?.note || 'Query classified as non-incident.'}`;
  }

  const c = result.case;
  let receipt = `Relay Trust Receipt\n-------------------\n`;
  receipt += `Case ID: ${c.id}\n`;
  receipt += `Status: ${c.status}\n`;
  receipt += `Responsible Actor: ${c.responsible_actor || 'Unassigned'}\n`;
  receipt += `SLA: ${c.sla || 'N/A'}\n\n`;
  receipt += `What happens next:\n`;
  receipt += whatHappensNext(c);
  if (result.duplicate) {
    receipt += `\n\nNote: this looks like a report Relay already has, so it was not counted again.`;
  }

  return receipt;
}

/**
 * Send WhatsApp text reply via Meta Graph API.
 */
async function sendWhatsAppMessage(to, textBody) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneId) {
    console.warn('[WhatsApp Reply] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing in environment. Skipping live message send.');
    return null;
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: textBody }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp Reply Error] Status ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[WhatsApp Reply Sent] Message sent to ${to}, ID: ${data.messages?.[0]?.id || 'unknown'}`);
    return data;
  } catch (err) {
    console.error('[WhatsApp Reply Exception]', err.message);
    return null;
  }
}

/**
 * Fetch and download WhatsApp audio attachment using Meta Graph API.
 */
async function fetchAndTranscribeAudio(mediaId, mimeType) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN missing: cannot download the voice note.');
  }

  try {
    // 1. Get media URL
    const mediaMetaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!mediaMetaRes.ok) {
      const errText = await mediaMetaRes.text();
      throw new Error(`Meta Graph API media lookup failed (status ${mediaMetaRes.status}): ${errText}`);
    }

    const mediaMetaData = await mediaMetaRes.json();
    const mediaUrl = mediaMetaData.url;
    const finalMime = mediaMetaData.mime_type || mimeType || 'audio/ogg';

    // 2. Download media binary
    const audioRes = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!audioRes.ok) {
      throw new Error(`Meta media binary download failed (status ${audioRes.status})`);
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 3. Transcribe audio buffer
    return await transcribeAudio(audioBuffer, `whatsapp_${mediaId}.ogg`, finalMime);
  } catch (err) {
    console.error('[WhatsApp Media Fetch Error]', err.message);
    throw err;
  }
}

/**
 * Process individual incoming WhatsApp message.
 */
async function processIncomingMessage(message) {
  const from = message.from;
  if (!from || !senderAllowed(from)) {
    console.warn('[WhatsApp Webhook] Message ignored: missing sender or sender rate limit reached.');
    return;
  }
  let reportText = null;
  let isVoice = false;
  let transcript = null;
  let transcribedBy = null;

  if (message.type === 'text' && message.text) {
    reportText = message.text.body;
  } else if (message.type === 'audio' && message.audio) {
    isVoice = true;
    const mediaId = message.audio.id;
    const mimeType = message.audio.mime_type;
    try {
      // transcribeAudio returns { text, transcribedBy } (the old code used the whole object as the text)
      const transcription = await fetchAndTranscribeAudio(mediaId, mimeType);
      transcript = transcription.text;
      transcribedBy = transcription.transcribedBy;
      reportText = transcript;
    } catch (err) {
      console.error('[WhatsApp Voice Failed]', err.message);
      await sendWhatsAppMessage(from, 'Relay could not process your voice note. Please send your report as a text message.');
      return;
    }
  }

  if (!reportText || !reportText.trim()) {
    console.warn(`[WhatsApp Webhook] Unhandled message type '${message.type}' or empty body from ${from}.`);
    return;
  }

  // Late require processReportIntake from ./app to prevent circular dependency issues
  const { processReportIntake } = require('./app');

  const intakeResult = await processReportIntake({
    text: reportText,
    isVoice,
    transcript,
    transcribedBy,
    source: 'WhatsApp',
    reporter: from,
    notifyTo: from
  });

  const receiptBody = buildReceiptText(intakeResult);
  await sendWhatsAppMessage(from, receiptBody);
}

/**
 * Meta signs every webhook POST with the app secret (X-Hub-Signature-256). Without checking it, anyone could post
 * made-up messages. In production a missing WHATSAPP_APP_SECRET means the webhook refuses every POST.
 */
function verifyMetaSignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return { ok: false, reason: 'WHATSAPP_APP_SECRET is not set in production' };
    if (!verifyMetaSignature.warned) {
      verifyMetaSignature.warned = true;
      console.warn('[WhatsApp Webhook] WHATSAPP_APP_SECRET is not set: webhook signatures are NOT verified (development only).');
    }
    return { ok: true };
  }
  const header = req.headers['x-hub-signature-256'];
  if (!header || !req.rawBody) return { ok: false, reason: 'missing signature' };
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid signature' };
  return { ok: true };
}

// At most 10 messages per sender per 10 minutes (in memory, keyed by a hash of the sender id).
const senderHits = new Map();
function senderAllowed(from) {
  const key = crypto.createHash('sha256').update(String(from)).digest('hex');
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (senderHits.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= 10) { senderHits.set(key, recent); return false; }
  recent.push(now);
  senderHits.set(key, recent);
  if (senderHits.size > 10000) senderHits.delete(senderHits.keys().next().value);
  return true;
}

// POST /webhook — Receive incoming WhatsApp webhook payloads
router.post('/', (req, res) => {
  const sig = verifyMetaSignature(req);
  if (!sig.ok) {
    console.warn(`[WhatsApp Webhook] Rejected POST: ${sig.reason}`);
    return res.sendStatus(403);
  }
  // Return HTTP 200 immediately per Meta requirements
  res.status(200).send('EVENT_RECEIVED');

  // Process event payload asynchronously
  (async () => {
    try {
      const body = req.body;
      if (!body || body.object !== 'whatsapp_business_account') {
        return;
      }

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value || {};

          // Ignore status-update payloads or non-message events
          if (!value.messages || !Array.isArray(value.messages)) {
            continue;
          }

          for (const message of value.messages) {
            await processIncomingMessage(message);
          }
        }
      }
    } catch (err) {
      console.error('[WhatsApp Webhook Async Processing Error]', err);
    }
  })();
});

module.exports = router;
module.exports.buildReceiptText = buildReceiptText;

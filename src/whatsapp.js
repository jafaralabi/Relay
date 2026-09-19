const express = require('express');
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
  receipt += `Your signal has been verified and logged. The assigned responder (${c.responsible_actor}) is notified and bound by the ${c.sla} SLA.`;

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
    console.warn('[WhatsApp Media] WHATSAPP_ACCESS_TOKEN missing. Using fallback transcription.');
    return transcribeAudio(Buffer.from(''), 'voice.ogg', mimeType || 'audio/ogg');
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
    console.warn('[WhatsApp Media] Falling back to default transcription.');
    return transcribeAudio(Buffer.from(''), 'voice.ogg', mimeType || 'audio/ogg');
  }
}

/**
 * Process individual incoming WhatsApp message.
 */
async function processIncomingMessage(message) {
  const from = message.from;
  let reportText = null;
  let isVoice = false;
  let transcript = null;

  if (message.type === 'text' && message.text) {
    reportText = message.text.body;
  } else if (message.type === 'audio' && message.audio) {
    isVoice = true;
    const mediaId = message.audio.id;
    const mimeType = message.audio.mime_type;
    transcript = await fetchAndTranscribeAudio(mediaId, mimeType);
    reportText = transcript;
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
    reporter: from,
    notifyTo: from
  });

  const receiptBody = buildReceiptText(intakeResult);
  await sendWhatsAppMessage(from, receiptBody);
}

// POST /webhook — Receive incoming WhatsApp webhook payloads
router.post('/', (req, res) => {
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

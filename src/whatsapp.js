const express = require('express');
const { classifyReport } = require('./classifier');
const { createCase } = require('./db');

const router = express.Router();

/**
 * Helper function to send WhatsApp Cloud API message reply
 */
async function sendWhatsAppReceipt(to, caseRecord) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn('[WhatsApp] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set. Skipping sending WhatsApp receipt.');
    return;
  }

  const receiptMessage =
`📋 *Relay Trust Receipt*
--------------------------------
*Case ID:* ${caseRecord.id}
*Status:* ${caseRecord.status}
*Responsible Actor:* ${caseRecord.responsible_actor}
*SLA:* ${caseRecord.sla}

*What happens next:* Your report has been logged as a Signal. Our system is routing this report to local responders for verification and action.`;

  try {
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: false,
          body: receiptMessage
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp] Failed to send receipt. Status: ${response.status}, Error: ${errText}`);
    } else {
      console.log(`[WhatsApp] Receipt sent successfully to ${to} for Case ${caseRecord.id}`);
    }
  } catch (err) {
    console.error('[WhatsApp] Exception sending WhatsApp receipt:', err.message);
  }
}

/**
 * Helper to download media from Meta Graph API and transcribe via Groq Whisper API
 */
async function transcribeAudio(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiKey = process.env.GROQ_API_KEY;

  if (!token) {
    throw new Error('WHATSAPP_ACCESS_TOKEN not configured.');
  }

  // Step 1: Get media URL from Graph API
  const mediaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch media info from WhatsApp API: ${mediaRes.statusText}`);
  }

  const mediaData = await mediaRes.json();
  const mediaUrl = mediaData.url;

  if (!mediaUrl) {
    throw new Error('No media URL returned by Meta Graph API.');
  }

  // Step 2: Download media file
  const audioRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!audioRes.ok) {
    throw new Error(`Failed to download audio content: ${audioRes.statusText}`);
  }

  const audioBuffer = await audioRes.arrayBuffer();

  if (!apiKey) {
    console.warn('[WhatsApp] GROQ_API_KEY missing. Cannot perform speech transcription.');
    return '[Voice message received, but GROQ_API_KEY is not configured for transcription.]';
  }

  // Step 3: Send audio file to Groq Whisper API
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mediaData.mime_type || 'audio/ogg' });
  formData.append('file', blob, 'audio.ogg');
  formData.append('model', 'whisper-large-v3');

  const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    throw new Error(`Groq Whisper API failed with status ${whisperRes.status}: ${errText}`);
  }

  const whisperData = await whisperRes.json();
  return whisperData.text || '';
}

/**
 * GET /webhook — Meta Verification Handshake
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && token === expectedVerifyToken) {
    console.log('[WhatsApp Webhook] Verification handshake successful.');
    return res.status(200).send(challenge);
  } else {
    console.warn('[WhatsApp Webhook] Verification handshake failed. Invalid token or mode.');
    return res.sendStatus(403);
  }
});

/**
 * POST /webhook — Handle incoming messages async
 */
router.post('/webhook', (req, res) => {
  // Always return 200 OK immediately to Meta
  res.sendStatus(200);

  const body = req.body;

  if (body && body.object === 'whatsapp_business_account') {
    if (Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            const value = change.value;
            if (value && Array.isArray(value.messages)) {
              for (const message of value.messages) {
                // Async processing of message
                processIncomingMessage(message).catch(err => {
                  console.error('[WhatsApp Webhook] Error processing message:', err);
                });
              }
            }
          }
        }
      }
    }
  }
});

/**
 * Process a single incoming WhatsApp message
 */
async function processIncomingMessage(message) {
  const from = message.from;
  let reportText = '';

  if (message.type === 'text' && message.text && message.text.body) {
    reportText = message.text.body;
  } else if (message.type === 'audio' && message.audio && message.audio.id) {
    console.log(`[WhatsApp Webhook] Received voice message (ID: ${message.audio.id}). Transcribing...`);
    try {
      reportText = await transcribeAudio(message.audio.id);
    } catch (err) {
      console.error('[WhatsApp Webhook] Audio transcription error:', err.message);
      reportText = '[Voice message received, but transcription failed.]';
    }
  } else {
    console.log(`[WhatsApp Webhook] Ignored non-text/audio message of type: ${message.type}`);
    return;
  }

  if (!reportText || !reportText.trim()) {
    console.warn('[WhatsApp Webhook] Empty report text after parsing message.');
    return;
  }

  console.log(`[WhatsApp Webhook] Ingesting report from ${from}: "${reportText.trim()}"`);

  // Classify report
  const classification = await classifyReport(reportText.trim());

  // Create case record
  const newCase = createCase({
    status: 'Signal',
    type: classification.type,
    severity: classification.severity,
    urgency: classification.urgency,
    confidence_score: classification.confidence_score,
    responsible_actor: classification.responsible_actor,
    sla: classification.sla,
    evidence: [reportText.trim()],
    raw_report: reportText.trim()
  });

  console.log(`[WhatsApp Webhook] Created Case ${newCase.id} for WhatsApp signal.`);

  // Send WhatsApp receipt back to user
  if (from) {
    await sendWhatsAppReceipt(from, newCase);
  }
}

module.exports = router;

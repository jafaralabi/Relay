# WhatsApp Cloud API Setup Guide for Relay

This document details the exact steps to configure Meta's WhatsApp Cloud API test number, connect the Relay webhook endpoint, and test text and voice message intake.

---

## 1. Prerequisites & Environment Variables

Copy `.env.example` to `.env` if you haven't already:

```bash
cp .env.example .env
```

Ensure the following variables are defined in `.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
WHATSAPP_ACCESS_TOKEN=your_whatsapp_temporary_or_permanent_access_token
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WEBHOOK_VERIFY_TOKEN=your_custom_webhook_verify_token
```

---

## 2. Meta Meta Developer App Setup

1. Go to the [Meta Developers Portal](https://developers.facebook.com/) and create or open your App.
2. Add **WhatsApp** product to your app.
3. Under **WhatsApp > API Setup**:
   - Copy the **Temporary access token** (or configure a System User token) and set `WHATSAPP_ACCESS_TOKEN` in `.env`.
   - Copy the **Phone number ID** for your test number and set `WHATSAPP_PHONE_NUMBER_ID` in `.env`.
   - Add your recipient phone number to the **To** field on the API Setup page to enable test messaging.

---

## 3. Local Webhook Tunneling (ngrok / cloudflared) or Production (Render)

Meta requires a publicly accessible HTTPS URL to deliver webhook events.

### Option A: Local testing with ngrok
```bash
# Start your local server
npm start

# In another terminal, start ngrok on port 3000
ngrok http 3000
```
Copy the generated HTTPS URL (e.g. `https://a1b2c3d4.ngrok-free.app`). Your webhook callback URL is:
`https://a1b2c3d4.ngrok-free.app/webhook`

### Option B: Local testing with cloudflared
```bash
cloudflared tunnel --url http://localhost:3000
```
Copy the generated HTTPS trycloudflare URL. Your callback URL is:
`https://<your-subdomain>.trycloudflare.com/webhook`

### Option C: Production Deployment (Render / Railway)
Use your deployed domain URL:
`https://your-relay-app.onrender.com/webhook`

---

## 4. Configuring Webhook in Meta Developer Dashboard

1. Navigate to **WhatsApp > Configuration** in your Meta App Dashboard.
2. Click **Edit** under **Webhook**.
3. Set **Callback URL** to your `/webhook` URL (e.g. `https://a1b2c3d4.ngrok-free.app/webhook`).
4. Set **Verify Token** to match the `WEBHOOK_VERIFY_TOKEN` string in your `.env`.
5. Click **Verify and Save**. Meta will send a `GET /webhook` request with `hub.verify_token` and expect `hub.challenge` returned.
6. Under **Webhook fields**, click **Manage** and subscribe to **`messages`**.

---

## 5. Sending Test Messages

1. Send a text message (e.g., *"Armed men gathering near Agege market entrance..."*) from your registered test recipient number to the WhatsApp test number.
2. Relay ingests the report, classifies it using Groq (Llama 3.3 70B), creates a case record starting at status `Signal`, and replies with a WhatsApp **Trust Receipt**.
3. Send a voice note to test audio ingestion: Relay fetches the media from Meta, transcribes audio via Groq Whisper (`whisper-large-v3`), classifies the transcribed text, and sends a Trust Receipt back.

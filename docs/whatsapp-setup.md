# WhatsApp Cloud API Webhook Setup Guide

This guide provides step-by-step instructions for configuring Meta's WhatsApp Cloud API test number and connecting it to the Relay incident intake webhook (`/webhook`).

---

## 1. Meta Developer App Setup

1. Go to the [Meta for Developers Console](https://developers.facebook.com/).
2. Create or select a Business App (e.g., "Relay Incident System").
3. Add the **WhatsApp** product to your app.
4. Under **WhatsApp > API Setup**:
   - Locate your **Temporary Access Token** (or create a permanent System User Token) and set `WHATSAPP_ACCESS_TOKEN` in your `.env`.
   - Locate your **Phone Number ID** (e.g. `105...`) and set `WHATSAPP_PHONE_NUMBER_ID` in your `.env`.

---

## 2. Add Test Recipient / Tester Phone Number

Meta test numbers can only send messages to pre-registered recipient phone numbers.

1. In Meta Developer Console, navigate to **WhatsApp > API Setup**.
2. Scroll to **To** dropdown under "Send and receive messages".
3. Select **Manage Phone Number List**.
4. Add your personal WhatsApp phone number (with country code, e.g., `+234...`).
5. Enter the verification code sent to your WhatsApp to authorize the number.

---

## 3. Local Tunnel Setup (ngrok or cloudflared)

Meta requires an HTTPS endpoint for webhook callbacks.

### Option A: Using `ngrok`
```bash
# Start your local Relay server
npm start

# In a separate terminal, expose port 3000
ngrok http 3000
```
Copy the generated HTTPS URL (e.g., `https://a1b2c3d4.ngrok-free.app`).

### Option B: Using `cloudflared`
```bash
cloudflared tunnel --url http://localhost:3000
```
Copy the generated trycloudflare HTTPS URL.

### Option C: Production (Render / Railway)
Use your hosted production URL, e.g., `https://relay-api.onrender.com`.

---

## 4. Configure Webhook & Verification Token

1. Set a secret token in your `.env` file:
   ```env
   WEBHOOK_VERIFY_TOKEN=relay_secure_webhook_token_2026
   ```
2. Restart your Relay server.
3. In Meta Developer Console, navigate to **WhatsApp > Configuration**.
4. Click **Edit** under **Webhook**.
5. Set **Callback URL**:
   ```
   https://<your-domain>/webhook
   ```
   *(e.g., `https://a1b2c3d4.ngrok-free.app/webhook` or `https://relay-api.onrender.com/webhook`)*
6. Set **Verify Token**:
   ```
   relay_secure_webhook_token_2026
   ```
   *(must match `WEBHOOK_VERIFY_TOKEN` in `.env`)*
7. Click **Verify and Save**. Meta will issue a `GET /webhook` request to verify the token handshake.

---

## 5. Webhook Field Subscription

1. Under **WhatsApp > Configuration > Webhook Fields**, locate **messages**.
2. Click **Subscribe**.
3. Ensure the `messages` event field shows status **Subscribed**.

---

## 6. Testing the Integration

1. Send a text message from your registered test WhatsApp number to the Meta test number:
   > *"There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared."*
2. Check your Relay server logs:
   - Webhook receives `POST /webhook` and returns `200 OK` immediately.
   - Classification pipeline processes report intake.
   - Case is created / corroborated with confidence score, responsible actor, and SLA assigned.
   - A Trust Receipt text reply is sent back to your WhatsApp number via Meta Graph API (`POST https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`).
3. Send a voice note to the test number:
   - Webhook downloads audio binary via Meta Graph API, transcribes it using Groq Whisper Large V3, creates/merges case, and sends back a Trust Receipt reply.

## Webhook signature (required in production)

Meta signs every webhook POST with your app secret (header `X-Hub-Signature-256`). Relay checks it, so nobody can post made-up messages.

1. In the Meta app dashboard open **App settings > Basic** and copy the **App secret**.
2. Set it as `WHATSAPP_APP_SECRET` (in `.env` locally, in the hosting dashboard when deployed).
3. With `NODE_ENV=production` and no `WHATSAPP_APP_SECRET`, Relay answers **403** to every webhook POST. Outside production it accepts unsigned posts and logs a warning once.
4. Each sender can send at most 10 messages per 10 minutes; extra messages are ignored.

# Relay Demo Video Recording Guide

This directory contains documentation and automated recordings demonstrating Relay's end-to-end civic signal intelligence pipeline from signal ingest to independent verification and Trust Receipts.

---

## Overview & Execution Modes

The demo video recording script (`npm run demo:record`) drives the real Relay web application through the 13-step storyboard using Playwright and Chromium at 1280x720 resolution.

The script operates in two modes controlled by the `DEMO_MODEL` environment variable:

### 1. `stub` Mode (DEFAULT)
* **Command**: `npm run demo:record` or `DEMO_MODEL=stub npm run demo:record`
* **Behavior**: Runs completely offline using fake Groq & Meta API interceptors (`scripts/lib/fake-apis.js`). No network access or API keys required.
* **Visual Marker**: Displays a permanent top-left red banner: `"OFFLINE RECORDING - MODEL RESPONSES ARE SIMULATED"`.
* **Output File**: `docs/demo/relay-demo-offline.webm` (and `docs/demo/relay-demo-stub.webm`).

### 2. `live` Mode
* **Command**: `DEMO_MODEL=live GROQ_API_KEY="your_groq_api_key" npm run demo:record`
* **Behavior**: Uses the real live Groq API (`openai/gpt-oss-120b`). Refuses to start unless `GROQ_API_KEY` is provided. Automatically pauses `DEMO_PACE_MS` (default 10000 ms) after steps calling the model to comply with Groq free tier rate limits (8,000 tokens/minute). If rate limited (HTTP 429), it automatically retries once after 30 seconds.
* **Visual Marker**: Clean recording without simulated model banner.
* **Output File**: `docs/demo/relay-demo-live.webm`.

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DEMO_MODEL` | `stub` | Mode selection: `stub` (offline mock model) or `live` (real Groq API). |
| `GROQ_API_KEY` | *(None)* | Required in `live` mode. Never commit or log this key. |
| `DEMO_PACE_MS` | `10000` | Delay in milliseconds after model-calling steps in `live` mode. |

---

## How to Run

### macOS / Linux (Bash or Zsh)

**Offline / Stub Mode:**
```bash
npm run demo:record
```

**Live Mode (with real Groq API):**
```bash
DEMO_MODEL=live GROQ_API_KEY="your-groq-key-here" npm run demo:record
```

---

### Windows (PowerShell)

**Offline / Stub Mode:**
```powershell
$env:DEMO_MODEL="stub"; npm run demo:record
```

**Live Mode (with real Groq API):**
```powershell
$env:DEMO_MODEL="live"; $env:GROQ_API_KEY="your-groq-key-here"; npm run demo:record
```

---

## Adding Voice-Over Narration

To convert the recorded `.webm` video to `.mp4` and merge it with a narrated audio track (recorded separately as `.wav` or `.m4a`):

```bash
ffmpeg -i docs/demo/relay-demo-offline.webm -i narration.m4a -c:v libx264 -c:a aac -shortest relay-demo.mp4
```

### Video Trimming with FFmpeg

If you need to trim start or end padding from the video:
```bash
ffmpeg -ss 00:00:02 -i docs/demo/relay-demo-offline.webm -to 00:03:30 -c copy docs/demo/relay-demo-trimmed.webm
```

---

## Challenge Video Constraints

* **Maximum Size Limit**: Up to 250 MB (our standard recording is ~11 MB, well below the threshold).
* **Target Duration**: 2.5 to 4.5 minutes (150s to 270s).
* **Commit Guidelines**: Commit ONLY `docs/demo/relay-demo-offline.webm`. Do NOT commit live recordings or API keys.

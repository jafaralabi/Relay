# Relay Demo Video Recording Guide

This directory contains documentation and automated recordings demonstrating Relay's position as open resolution infrastructure for civic reporting in Africa: any source in, one verified case, accountable responders out.

---

## Storyboard Overview & Multi-Source Narrative

The automated demo video recording script (`npm run demo:record`) drives the Relay web application through a 15-step storyboard using Playwright and Chromium at 1280x720 resolution. The narrative shows title and problem cards, a three-column infrastructure diagram ("How it plugs together"), database resets via `/demo.html`, the core verification pipeline (English report at Agege market, Pidgin corroborating report, simulated responder progression to Claimed Resolved, and independent community verification with Trust Receipt), scripted routing scenarios (Mile 12 market and Ijegun) contrasted with normal Signal routing (Oshodi market), interactive map stage icons, multi-source report merging and deduplication via the Partner App Simulator (`/partner-demo.html`), embedding Relay into partner services (`/embed-demo.html` with `embed.js`), and open developer documentation with live API calls (`/developers.html`). Upon completion, the script generates `docs/demo/relay-demo-chapters.txt` containing chapter timestamps to line up voice-over narration.

---

## Report Budget Rule

Intake is rate-limited to 10 POST requests per 10 minutes per client. To prevent rate-limit failures, the entire recording strictly adheres to a **budget of at most 9 reports**:
1. Step 6: 1 report (English Agege report via form)
2. Step 7: 1 report (Pidgin Agege report via form)
3. Step 10: 3 reports (Mile 12, Ijegun, and Oshodi reports via form)
4. Step 12: 3 reports (CommunityWatch, WaterAid Field App, and Market Traders Union duplicate via Partner App Simulator API)
5. Step 13: 1 report (SunBright Solar report via embeddable widget)

Total: **9 reports**. Do not exceed 9 reports in total.

---

## Overview & Execution Modes

The script operates in two modes controlled by the `DEMO_MODEL` environment variable:

### 1. `stub` Mode (DEFAULT)
* **Command**: `npm run demo:record` or `DEMO_MODEL=stub npm run demo:record`
* **Behavior**: Runs completely offline using fake Groq & Meta API interceptors (`scripts/lib/fake-apis.js`). No network access or API keys required.
* **Visual Marker**: Displays a permanent top-left red banner: `"OFFLINE RECORDING - MODEL RESPONSES ARE SIMULATED"`.
* **Output Files**: `docs/demo/relay-demo-offline.webm` and `docs/demo/relay-demo-chapters.txt`.

### 2. `live` Mode
* **Command**: `DEMO_MODEL=live GROQ_API_KEY="your_groq_api_key" npm run demo:record`
* **Behavior**: Uses the real live Groq API (`openai/gpt-oss-120b`). Refuses to start unless `GROQ_API_KEY` is provided in the shell environment or loaded from `.env`. Automatically pauses `DEMO_PACE_MS` (default 10000 ms) after steps calling the model to comply with Groq free tier rate limits (8,000 tokens/minute). If rate limited (HTTP 429), it automatically retries once after 30 seconds.
* **Visual Marker**: Clean recording without simulated model banner.
* **Output File**: `docs/demo/relay-demo-live.webm` (ignored by git).

---

## Command Line Options

Run `node scripts/demo-video/record.js --help` or `-h` to display usage options without initiating recording or starting the server:

```bash
node scripts/demo-video/record.js --help
```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DEMO_MODEL` | `stub` | Mode selection: `stub` (offline mock model) or `live` (real Groq API). |
| `GROQ_API_KEY` | *(None)* | Required in `live` mode (loaded from shell or `.env`). Never commit or log this key. |
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

## Adding Voice-Over Narration & Chapter File

The script automatically writes `docs/demo/relay-demo-chapters.txt` next to the video output file. Each line records the timestamp and step title (e.g. `2:11 Partner app simulator & multi-source merge`), helping align voice-over narration.

To convert the recorded `.webm` video to `.mp4` and merge it with a narrated audio track (recorded separately as `.wav` or `.m4a`):

```bash
ffmpeg -i docs/demo/relay-demo-offline.webm -i narration.m4a -c:v libx264 -c:a aac -shortest relay-demo.mp4
```

### Video Trimming with FFmpeg

If you need to trim start or end padding from the video:
```bash
ffmpeg -ss 00:00:02 -i docs/demo/relay-demo-offline.webm -to 00:04:30 -c copy docs/demo/relay-demo-trimmed.webm
```

---

## Challenge Video Constraints

* **Maximum Size Limit**: Up to 250 MB (our standard recording is ~18 MB, well below the threshold).
* **Target Duration**: ~3.5 to 6 minutes in stub mode.
* **Commit Guidelines**: Commit ONLY `docs/demo/relay-demo-offline.webm` and `docs/demo/relay-demo-chapters.txt`. Do NOT commit live recordings or API keys.

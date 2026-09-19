# Relay — Demo Video Recording Runbook & Script

This runbook provides exact step-by-step instructions for recording the demo video for Relay. It is designed to demonstrate the core resolution-layer thesis: **Signal → Corroboration → Classification & SLA Assignment → Action → Claimed Resolution → Independent Verification & Trust Receipt**.

---

## 1. Setup & Environment Preparation

1. Open two browser windows/tabs side by side or ready to switch:
   - **Tab 1 (Main App UI):** `http://localhost:3000/`
   - **Tab 2 (Demo Control Panel):** `http://localhost:3000/demo.html`
2. Ensure the Relay backend server is running (`npm start` or `node src/server.js`).
3. If `x-demo-key` is configured on the backend, type it into the Demo Key input box on `demo.html`.

---

## 2. Step-by-Step Recording Script

### Step 1: Reset Database & Show Empty State
* **Action in Demo Panel (`demo.html`):** Click **Reset Database**.
* **Action in Main UI (`/`):** Refresh the main page or observe live sync update.
* **What to Show on Screen:** The feed displays: *"No reports yet — submit one above."*
* **Voiceover / Narration:**
  > *"Welcome to Relay — the public verification and accountability engine. We are starting with a clean slate to demonstrate how Relay turns raw community signals into verified, SLA-backed resolution."*

---

### Step 2: Submit Initial Signal (English Report - Agege Market)
* **Action in Demo Panel (`demo.html`) or Main UI Form:** Click **Submit English Report** (or paste text into form):
  - **Text:** `There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.`
  - **Lat/Lng:** `6.6212`, `3.3262`
* **What to Show on Screen:**
  - Case appears in feed (e.g. `RLA-1001`).
  - Status is **Signal**.
  - Confidence score is **45%**.
  - Responsible actor assigned: **Community security responder + local police PRO contact** with SLA **30 minutes**.
  - Receipt displays *"Not yet acknowledged"*.
* **Voiceover / Narration:**
  > *"A initial text report comes in regarding an armed gathering at Agege Market. Relay instantly classifies it as Safety, High severity, and routes it to the local community security responder with a strict 30-minute SLA commitment."*

---

### Step 3: Corroborating Signal (Pidgin Report)
* **Action in Demo Panel (`demo.html`):** Click **Submit Pidgin Corroboration**:
  - **Text:** `Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.`
* **What to Show on Screen:**
  - Case automatically updates to **Accepted** / **In Progress**.
  - Evidence count updates to **"2 independent reports"**.
  - Confidence score jumps to **95%**.
  - Trust Receipt shows: `"22 minutes after report — SLA met ✓"`.
  - Map marker lights up with high-severity pulse.
* **Voiceover / Narration:**
  > *"A second corroborating signal in Nigerian Pidgin arrives from the same market area. Relay's language-agnostic pipeline matches the location, merges the evidence, and raises the confidence score to 95%. The responder auto-accepts the assignment, meeting the SLA in 22 minutes."*

---

### Step 4: Responder Advances Case (Dispatched & Claimed Resolved)
* **Action in Demo Panel (`demo.html`):**
  - Click **Advance Deep-Path Case** once: Note updates to *"Patrol dispatched to Agege market entrance"* (**In Progress**).
  - Click **Advance Deep-Path Case** second time: Note updates to *"Responders dispersed the group, no injuries"* (**Claimed Resolved**).
* **What to Show on Screen:**
  - Status changes to **Claimed Resolved**.
  - Resolution field in Trust Receipt shows **"Claimed"**.
  - Closed field displays **"No"** (because responder claims alone do not close a case).
* **Voiceover / Narration:**
  > *"The responder unit arrives and disperses the group. They mark the case 'Claimed Resolved'. But unlike traditional reporting tools, Relay does NOT close the case on the responder's word alone. Closed remains 'No'."*

---

### Step 5: Independent Third-Party Community Verification
* **Action in Demo Panel (`demo.html`):** Click **Submit Third-Party Verification**:
  - **Text:** `Confirmed by 3rd community member: area clear and calm, responders dispersed group without injuries.`
* **What to Show on Screen:**
  - Status updates to **Independently Verified**.
  - Map marker turns **Green**.
  - Resolution changes to **Independently Verified**.
  - Closed changes to **Yes**.
  - Independent Verification block renders: *"confirmed by an independent community report, T+61 min"*.
* **Voiceover / Narration:**
  > *"An independent third-party community member confirms 61 minutes later that the market is calm and shops have reopened. Now, and only now, Relay independently verifies the case and marks Closed: Yes."*

---

### Step 6: Show Shallow Path Cases & Seeded Fallback
* **Action in Demo Panel (`demo.html`):** Click **Seed Database**.
* **What to Show on Screen:**
  - **Mile 12 Dispute (Shallow Path 1):** Mediated volunteer path, stops at **Accepted** with `"Scripted demo routing"` badge.
  - **Ijegun Borehole (Shallow Path 2):** Institutional work order path, stops at **Assigned** with `"Scripted demo routing"` badge.
  - Demonstrate `http://localhost:3000/?fixtures=1` to show labeled sample data fallback if network or server is offline.
* **Voiceover / Narration:**
  > *"Relay also handles medium-severity incidents like market disputes at Mile 12 and infrastructure issues like school boreholes in Ijegun, routing them to trained volunteer mediators and municipal work order desks with clear SLAs."*

---

## 3. Automated One-Click Deep Path Option

If you prefer to run the entire deep-path sequence automatically while recording:
1. Open `http://localhost:3000/demo.html`.
2. Click **Run Full Deep Path (Automated with Pauses)**.
3. Switch to the main app tab `http://localhost:3000/` and record the UI updating live in real-time as the script executes with built-in pauses.

---

## 4. Final Trust Receipt Inspection Checklist for Video

When showing the final Agege Trust Receipt in the video, verify that it clearly displays:
- [x] **Case ID:** `RLA-XXXX`
- [x] **Status:** `Independently Verified`
- [x] **Evidence:** `2 independent reports (geolocation tagged, text signal)`
- [x] **Responsible Actor:** `Community security responder + local police PRO contact`
- [x] **SLA:** `30 minutes`
- [x] **Acknowledged:** `22 minutes after report — SLA met ✓`
- [x] **Resolution:** `Independently Verified`
- [x] **Closed:** `Yes`
- [x] **Independent Verification:** `Confirmed by 3rd community member... — confirmed by an independent community report, T+61 min`
- [x] **Timeline:** Step entries showing status badges and `T+` elapsed minutes.

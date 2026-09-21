# Relay — Engineering Build Brief

Distilled from `Relay-Concept-Brief-Build-Spec.docx` for a coding agent (e.g. Claude Code).
Read this file first. Only pull sections from the full spec doc if you need the "why," not the "what."

**Deadline: 21 September 2026, 23:59 UTC. Confirmed from the official hackathon site.**

---

## 0. Official judging rubric (confirmed from osf-hackathon.vercel.app/brief — build toward this, not a generic checklist)

Four **equally weighted** criteria:

| Criterion | What it means for us |
|---|---|
| **Uniqueness** | The resolution-layer thesis (not another reporting app) — already our strongest card |
| **Scalability** | "How well it can be scaled across geographies" — see §0.2, this needs an explicit answer, not just implied |
| **AI Coding Usage** | How well AI coding tools were used to *build* the project — this needs to be **visible**, not just true. Narrate it in the demo video and/or README (e.g. a short "built with Claude/Antigravity" note, a glimpse of the agent working, or a commit history that shows it) |
| **Presentation** | How well the submission is presented and aligned to the tracks |

### 0.1 Seven official operating constraints (from the brief — design against all seven explicitly)

1. **Trust and verification** — covered: multi-source confidence scoring, independent verification step
2. **Low bandwidth and limited access** — covered: WhatsApp/USSD, voice-to-text
3. **Accessibility and inclusion** — literacy levels, disabilities, digital confidence. **Not yet explicit anywhere.** Voice-first intake already *is* a literacy accommodation — say so directly in the README/deck/summary instead of leaving it implied.
4. **Privacy and security** — covered: Trust/Safety/Governance section, information classes
5. **Multilingual access** — covered narrowly (English + Pidgin demo, Nigerian-language roadmap). OSF's own Transformative Peace in Africa initiative spans the Sahel, DRC, Sudan, and Mozambique — French, Arabic, and Portuguese-speaking regions. Say explicitly in the deck/summary that the classification pipeline is language-agnostic by design (an LLM prompt, not a Nigerian-language-specific model) and that French/Arabic/Portuguese are a roadmap extension, not a structural limitation.
6. **Local relevance** — covered: locally-assigned responsible actors, local SLA context
7. **Clear next steps** — covered: the Trust Receipt tells the user exactly what happens next

### 0.2 Exact submission formats (confirmed — get these right the first time)

- **GitHub repo:** must be **public**, with a clear README (this file's sibling)
- **Demo video:** mp4, mov, webm, or avi — up to 250MB
- **Pitch deck:** **PDF only** — up to 100MB (build it in whatever tool, export to PDF before submitting)
- **Written summary:** must explicitly cover four things — (1) your track, (2) your information sources, (3) your approach to trust and accuracy, (4) how you used AI tools. Build `SUMMARY.md` against this exact structure, not a generic write-up.

Rule confirmed from the brief: *"Please refrain from using AI to generate your capstone idea."* The written summary states exactly how AI was used: AI assistants helped gather and compare research, and the author chose the problem, Relay and its scope. It says this plainly, since it directly answers a stated rule.

---

## 1. What we're building (PoC scope only — do not build beyond this list)

A demo web app that:
1. Accepts an incident report as **text or voice** (via a WhatsApp test-number webhook, or a fallback web chat form)
2. Transcribes voice → text (Groq-hosted Whisper Large V3, OpenAI-compatible API) if needed
3. Classifies the report: type, severity, urgency, and which actor class owns it
4. Scores confidence from corroboration/consistency signals (simplified — see §4)
5. Assigns a named responsible actor and simulates that actor **accepting an SLA** (a scripted demo responder, not a real integration)
6. Moves the case through the status schema (§3) as the demo progresses
7. Displays a status-aware map (Leaflet + OpenStreetMap) and a case feed
8. Generates a **Trust Receipt** (§5) per case
9. For ONE flagship case only: carries it all the way to "Independently Verified" with evidence attached

Everything else in the full spec (crowdfunding, POS agents, wearables, real security-agency integration, full trust/safety access control) is **pitch-deck roadmap only — do not build any of it.**

---

## 2. Locked technical decisions (do not re-litigate these — just use them)

| Decision | Choice | Why |
|---|---|---|
| LLM | Groq API (GPT-OSS 120B) | classification, routing, responsibility mapping — same key/provider as speech-to-text, consolidated to one dependency |
| Speech-to-text | Groq API (Whisper Large V3) | voice-note transcription — free tier, OpenAI-compatible request format |
| Backend | Node.js + Express, or Python + FastAPI — pick whichever you're faster in | speed over purity |
| Chat channel | Meta WhatsApp Cloud API **test number** (no business verification) | fast to stand up, real channel |
| Fallback channel | Simple web chat form, same backend | if WhatsApp setup stalls, don't lose a day to it |
| Map | Leaflet.js + OpenStreetMap tiles | free, no API key, no signup |
| Hosting | Render or Railway | push-to-deploy, free tier, minutes not hours |
| Data store | SQLite or a simple JSON store | this is a demo, not production — don't build a real DB layer |

---

## 3. Case status schema (implement exactly this — it's the core product idea)

```
Signal → Corroborating → Verified → Assigned → Accepted → In Progress → Claimed Resolved → Independently Verified
```

Every case record needs: `id`, `status`, `type`, `severity`, `confidence_score`, `responsible_actor`,
`sla`, `acknowledged_at`, `evidence[]`, `independent_verification`, `created_at`, `updated_at`.

---

## 4. Confidence scoring (simplified for the demo — do not overbuild)

Combine, as a simple weighted score, not a real ML model:
- number of corroborating reports for the same location/type within a time window
- basic geospatial consistency (same rough area)
- presence of media evidence (photo/voice attached)
- absence of contradictory reports

Output a 0–100 confidence score. That's enough — this is illustrating the *concept* of multi-source
verification, not shipping a production trust engine.

---

## 5. Trust Receipt (render this as a UI component — it's the single best demo artifact)

```
Case ID: RLA-XXXX
Status: [current status]
Evidence: [n] independent reports + [geolocation/image if present]
Responsible actor: [name/role]
SLA: [e.g. 48 hours]
Acknowledged: [time elapsed]
Action: [short description]
Resolution: [Claimed / Independently Verified]
Closed: [Yes/No]
```

---

## 6. Demo dataset — three incidents (edit freely, but don't start from a blank page)

### Deep path (carry this ONE all the way to Independently Verified)
**Type:** Safety — community threat
**Channel:** WhatsApp, text
**Report (English):** "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now."
**Report (Pidgin variant, second corroborating reporter):** "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot."
→ Classify: Safety / High severity / High urgency
→ Assign: community security responder + local police PRO contact (demo entities)
→ SLA: 30 minutes acknowledgement
→ Accept → In Progress → Claimed Resolved ("responders dispersed the group, no injuries")
→ Independently Verified: a third community member confirms the area is calm 20 minutes later

### Shallow path 1 — community dispute
**Type:** Stability — land/market dispute
**Report:** "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming."
→ Classify: Stability / Medium severity
→ Route to: trained volunteer/community mediator path
→ Show through: Assigned → Accepted (stop here for the demo)

### Shallow path 2 — service failure
**Type:** Transparency — infrastructure
**Report:** "The borehole at Ijegun primary school has been broken for two weeks, children have no water."
→ Classify: Transparency / Medium severity
→ Route to: institutional work-order path (simulated local government contact)
→ Show through: Assigned (stop here for the demo)

---

## 7. Compressed 5-day plan (today is Day 1)

| Day | Date | Focus | Must-ship by end of day |
|---|---|---|---|
| 1 | Sep 16 (today) | Setup (see checklist below) + scaffold repo + ingestion + classification pipeline (text only, English) | A message in → a classified case out, visible in a terminal/log |
| 2 | Sep 17 | Add Pidgin + voice transcription; build confidence scoring; build responsibility assignment + SLA/commitment simulation | All 3 demo incidents classify and route correctly end to end (logic level, no UI yet) |
| 3 | Sep 18 | Build the web UI: case feed, status-aware map, Trust Receipt component; wire WhatsApp test number in | Working demo reachable in a browser + via WhatsApp test number |
| 4 | Sep 19 | Full polish pass: run the deep path end to end through Independently Verified; fix bugs; write README | Feature-complete, demoable without babysitting |
| 5 | Sep 20 | Record demo video, build pitch deck, write the summary doc, deploy final hosted version | All 5 deliverables done |
| — | Sep 21 | Submit with buffer before deadline | Submitted |

Note this compresses the original 9-day plan's Day 6–9 polish/deck/video work into 2 days (Sep 19–20) —
keep the build itself ruthlessly scoped to §1 so there's actually time left for the video and deck,
which are graded deliverables in their own right.

---

## 8. Do not build (say it out loud before starting each day)

- Crowdfunding, diaspora targeting, non-monetary contribution matching
- POS-agent distribution, wearable-device capture
- Real integration with any actual government/security agency
- Full Public/Restricted/Protected access-control enforcement (mention it in the README as designed-for, not built)
- Any authentication/user-account system — this is a demo, not a product
- A real ML confidence model — the weighted heuristic in §4 is sufficient

---

## 9. Acceptance test for "are we done"

Can a judge, watching the demo video, see: a report go in → get classified → get assigned to a named
actor with an SLA → get acted on → get independently confirmed resolved → and see the Trust Receipt
for that case? If yes, the core thesis is proven and the rest is polish.

Second test, against the real rubric (§0): does the video or README make it *visible* that this was
built with AI coding tools — not just claim it in the summary? A judge should not have to take our
word for it.

## 10. SUMMARY.md structure (build this against the exact required sections — see §0.2)

```markdown
# Relay — Written Summary

## Track
[Safety, Reporting & Protection — primary; architecture is cross-track]

## Information sources
[what the classification/routing rules are grounded in; demo data sourcing]

## Approach to trust and accuracy
[multi-source confidence scoring, independent verification step, Trust Receipt —
point back to the core model in the full spec doc]

## How we used AI tools
[Idea origination: the author chose the problem, Relay and its scope; AI assistants were used to gather and compare research. Build: [Jules / your coding agent] used for the majority of the
codebase, working from BUILD_BRIEF.md and the five GitHub issues — be specific about what
the agent built vs. what was directed/reviewed by hand. Runtime: Groq-hosted GPT-OSS 120B
and Whisper Large V3 power the app's own classification and transcription at runtime —
distinct from the coding agent that built it.]
```

# Relay

**Relay is open resolution infrastructure for civic reporting in Africa: any source in, one verified case, accountable responders out.**

Like a payments switch, it lets many tools and many institutions connect once and share one record: signal-to-resolution
infrastructure, built for the Andela x Open Society Foundations
*"Information You Can Trust"* Peace Tech Innovation Challenge.

Track: **Safety, Reporting & Protection** (the architecture spans all three challenge tracks)

---

## The problem

African civic tech has spent 18 years getting very good at one thing: capturing a report and
putting it on a map. Ushahidi, BudgIT, U-Report, DUBAWA, Namola — each of them is excellent at
the signal-capture layer. What almost none of them do is close the loop. A verified report goes
in, and then it sits — with no institutional actor obligated to act, no proof of what happened
next, and no way for the person who reported it to know whether anything changed.

That finding held up across four independent market-research passes we ran before building
anything: *"no end-to-end pipeline from signal to resolution"*, in one phrasing or another,
every time.

## What Relay does

Relay takes a report — a threat, a dispute, a service failure — from a WhatsApp message, a web form
or a voice note, all the way through to an **independently verified resolution**, with a
citizen-facing record they can hold onto as proof their report entered an accountable process.

```
Signal → Corroborating → Verified → Assigned → Accepted → In Progress
       → Claimed Resolved → Independently Verified
```

A report isn't just routed somewhere and forgotten. It is assigned to a **named responsible
actor** with an SLA, and resolution isn't taken on faith — it is confirmed by someone other than
the actor who claimed it.

## The Trust Receipt

Every case produces a record like this — the thing almost no existing African civic-tech tool
gives a citizen today:

```
Case ID: RLA-6564
Status: Independently Verified
Evidence: 2 independent reports (English + Nigerian Pidgin) + geolocation
Independent verification: 1 confirmation from a third community member, 20 minutes after the claim
Responsible actor: Community security responder + local police PRO contact
SLA: 30 minutes
Acknowledged: 22 minutes after report (SLA met)
Action: Responders dispersed the group, no injuries
Resolution: Claimed → Independently Verified
Closed: Yes
```

The web app renders this as a printable receipt for every case, with a status timeline, and the
map colours each case by how far along the loop it is.

## How it works (this proof of concept)

1. A report arrives by WhatsApp (Meta test number), the web form, or a voice note (text or audio).
2. Voice is transcribed with Groq-hosted **Whisper Large V3**, prompted with local place names and
   Nigerian Pidgin vocabulary.
3. Groq-hosted **GPT-OSS 120B** classifies type (Safety / Stability / Transparency), severity, urgency
   and the class of actor who should own the problem. Messages that are not incidents create no case.
4. The place is matched to a local gazetteer (fuzzy matching, so a mis-heard "Agaigee Market" still
   resolves to "Agege market") and to coordinates.
5. A simple weighted confidence score combines corroboration, geographic consistency and evidence.
   **A single report never reaches "Verified"**: it needs at least two independent reports and a
   score of 60 or more.
6. The case is assigned to a named responsible actor with an SLA. In this proof of concept the actor
   is a scripted demo responder that accepts the assignment.
7. The case moves through the remaining statuses. One flagship case (Agege market) is carried all the
   way to Independently Verified: a third community member's report confirms the area is calm, which
   is checked by the model and by a rule that the confirming person differs from the original
   reporters and from the responder.
8. Every case gets a Trust Receipt, a status-aware map marker, and a feed entry.

## What's real, what's simulated, what's roadmap

**Real in this build:** intake (text and voice on the web; the WhatsApp webhook is implemented and tested
with signed test payloads, but not yet tested live with Meta), Pidgin-aware classification, place
matching, the corroboration and verification rules, responsibility assignment with SLAs, the full
status schema, the independent-verification check, the Trust Receipt, and the map and feed.

**Simulated for the demo (and labelled as such in the app):**
- Responders are scripted. Acceptance, "in progress" and "claimed resolved" are triggered by demo
  controls, and the 22-minute acknowledgement time is a simulated responder delay.
- Reports about Mile 12 market and Ijegun are routed by a scripted demo rule so the two shallow paths can
  show their routing. They are marked "Scripted demo routing" in their receipts. Any other report follows
  the normal rules and stays at Signal until a second independent report corroborates it.
- The independent confirmation is submitted through the demo panel or API. Routing a confirmation
  received over WhatsApp is roadmap.
- Sample cases created by the seed button are marked "Seeded sample".

**Roadmap, deliberately not built:** integrations with real government or security agencies,
crowdfunding and resource mobilisation, POS-agent and wearable-device distribution, and
production-grade access control on sensitive case data. Building these convincingly in days would
have meant cutting corners on the parts that prove the thesis.

## Trust and accuracy

- **Corroboration before verification.** One report is capped at a low confidence score and stays at
  "Signal". Verification needs two independent reports plus a threshold score.
- **Independent resolution.** "Claimed resolved" (by the actor) and "Independently verified" (by
  someone else) are different statuses on purpose.
- **No silent fakes.** If the model is unavailable or rate limited, the app retries, tries backup
  models, and only then uses a keyword fallback that is flagged on the case (`classified_by`) and
  logged. A failed transcription returns an error and creates no case. The independent-verification
  step has no fallback at all.
- **Imperfect audio is expected.** Transcripts of Pidgin voice notes are imperfect; in our tests the
  classifier and place matcher still routed them correctly, and the receipt keeps the transcript so a
  human can check it.
- **The score is a heuristic, not a trained model.** We say so rather than dress it up.

## Designed for real conditions

- **Low bandwidth:** WhatsApp and voice-note intake work on basic connectivity. The web app is a small
  static page with no build step, polls gently and pauses in background tabs.
- **Accessibility and inclusion:** voice-first reporting means someone doesn't need to read or type to
  be heard. This is a deliberate literacy and digital-confidence accommodation. Statuses always carry
  text labels (not colour alone), and the interface is keyboard-operable and works at phone width.
- **Multilingual by design:** classification and transcription are prompt-driven, not tied to a
  language-specific model. The demo runs English and Nigerian Pidgin, and the same pipeline extends to
  French, Arabic and Portuguese — the languages of the Sahel, DRC, Sudan and Mozambique, where OSF's
  own Transformative Peace in Africa initiative operates. That is a roadmap extension, not a
  structural limit.
- **Privacy and security:** reporter identifiers are hashed and never returned by the API, public
  coordinates are rounded, public intake is rate limited, and demo controls are key protected.
  Sensitive categories (GBV, whistleblower identity, minors) are designed around information classes
  that are never surfaced publicly; that enforcement is designed-for, not built.
- **Local relevance, clear next steps:** every case is assigned to a locally relevant actor with a
  stated SLA, and the Trust Receipt tells the reporter exactly what happens next.

## Scalable across geographies

Adding a new city or country is mostly **data, not code**: a place list (`data/locations.json`) and a
list of responsible actors with SLAs (`data/actors.json`), plus the languages the prompts should
expect. The pipeline itself — classify, match, corroborate, assign, verify — is the same everywhere.
Nigeria's Lagos is the pilot; the model of "a locally assigned actor plus an independent check" is what
travels.

## Why this, and not just another reporting app

The moat isn't the app — any current LLM can classify "there's a broken water pipe near my house."
The moat is the response network, the institutional relationships, and the verified case history that
accumulate over time. Relay's job is to be the infrastructure underneath Africa's civic-tech layer, not
one more destination app competing with the ones that already exist.

## Open API and interoperability

Relay is meant to sit underneath civic-reporting tools, not beside them: build the response infrastructure once, and let
every organisation plug into it. The API is documented in [`docs/openapi.yaml`](./docs/openapi.yaml) (OpenAPI 3.1), and the
full partner framework (sources, responders, access classes, how it would be run) is in
[`docs/PARTNER_FRAMEWORK.md`](./docs/PARTNER_FRAMEWORK.md). Developer documentation with an endpoint list, live example and a
partner-key preview is at `/developers.html`. To see several sources feed one case, open `/partner-demo.html`
(a page that stands in for other applications) next to the dashboard.

- **Built:** open report intake (`POST /api/reports` with an optional `source` naming the sending application, voice notes,
  the WhatsApp webhook); a new report is matched to an existing open case at the same place and type, so duplicates join
  instead of multiplying and every source is listed on the case; and a public read API
  (`GET /api/cases`, `GET /api/cases/{id}`) showing status, responsible actor, SLA, history and independent verification,
  with phone numbers and emails masked, reporter identifiers hashed and coordinates rounded.
- **Roadmap, not built:** partner API keys with source attribution; verified regulator and NGO accounts with role-based
  views; confidentiality classes (Public, Restricted, Protected) so that sensitive cases are visible only to designated
  organisations; search and "has this already been reported?" lookups; and notifications when a case changes.

```bash
curl -X POST http://localhost:3000/api/reports -H "Content-Type: application/json" \
  -d '{"text":"The borehole at Ijegun primary school has been broken for two weeks."}'
curl http://localhost:3000/api/cases
```

## Open source and distribution

Relay is open source (MIT) and is meant to sit underneath the tools that already reach people, not to compete with them.

- **Open standard:** the API and case schema ([`docs/openapi.yaml`](./docs/openapi.yaml)), the status schema and the verification rules.
- **Open-source clients:** this dashboard, the report form, WhatsApp intake, and an **embeddable widget**. A service that reaches last-mile
  communities adds one line, `<script src="https://YOUR-RELAY-HOST/embed.js" data-source="YourAppName"></script>`, and its customers get a
  "Report a problem" button and a case tracker. Try it at `/embed-demo.html` (a simulated partner website).
- **Shared infrastructure:** the case registry, matching and verification, and the connections to responders and oversight bodies stay
  operated as the network layer, so every embedded client contributes to one record.

Built: MIT licence, the API, web clients, WhatsApp webhook, embeddable widget, partner simulator. Roadmap: SDKs, federation for
self-hosted copies, a governance group, a partner directory. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`docs/PARTNER_FRAMEWORK.md`](./docs/PARTNER_FRAMEWORK.md).

## Tech stack

| Layer | Choice |
|---|---|
| Classification / routing | Groq API — `openai/gpt-oss-120b` (with backup models for rate limits) |
| Speech-to-text | Groq API — `whisper-large-v3` |
| Backend | Node.js, Express, SQLite |
| Messaging channel | WhatsApp Cloud API (test number) plus the web form |
| Map | Leaflet.js with OpenStreetMap tiles |
| Hosting | Render |

## Running it locally

```bash
git clone https://github.com/jafaralabi/Relay.git
cd Relay
npm install
cp .env.example .env   # add your GROQ_API_KEY (covers classification and transcription)
npm start
```

Open `http://localhost:3000`. Run the verification suite (it calls the model, so leave about a minute
between runs on the free tier):

```bash
node scripts/verify.js
```

Walk the flagship case end to end with the scripted demo:

```bash
node scripts/demo-run.js
```

The demo panel is at `/demo.html`; it needs the `DEMO_KEY` from your `.env`. For WhatsApp, follow
[`docs/whatsapp-setup.md`](./docs/whatsapp-setup.md). A step-by-step recording script is in
[`docs/DEMO_RUNBOOK.md`](./docs/DEMO_RUNBOOK.md).

### Environment variables

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Classification and transcription (required) |
| `GROQ_MODEL`, `GROQ_FALLBACK_MODELS` | Chat model and backup models (defaults provided) |
| `GROQ_STT_MODEL`, `WHISPER_PROMPT` | Speech model and its spelling prompt (defaults provided) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WEBHOOK_VERIFY_TOKEN` | WhatsApp Cloud API |
| `DEMO_KEY` | Protects the demo controls |
| `REPORTER_SALT` | Salt for hashing reporter identifiers |
| `SEED_ON_EMPTY` | Seeds the sample cases when the database is empty (hosted demo) |

Never commit `.env`; it is git-ignored.

## Built with AI coding tools

**Idea origination:** I chose the problem, the concept (Relay) and its scope myself. I used AI assistants
(Claude, ChatGPT, Perplexity and Gemini) to research what problems exist in African civic tech and to compare
existing initiatives. The assistants also made recommendations; the decision to build Relay, and its design and
scope, were mine, and the design developed well beyond those recommendations (for example the open, embeddable
infrastructure model). The challenge asks that AI not be used to generate the capstone idea, so this section
says exactly where AI was and was not used.

**Build:** the backend, web interface and WhatsApp integration were written mostly by **Jules**
(Google's asynchronous coding agent). Each piece was a GitHub issue written against
[`BUILD_BRIEF.md`](./BUILD_BRIEF.md), and each came back as a pull request that was reviewed and tested
by hand before merging. The issues and pull requests in this repository are the record. **Claude** was
used as an engineering partner for planning the task breakdown, reviewing pull requests, debugging, and
writing the offline test suites and three tested patch scripts that applied late fixes. Each of Jules's pull requests was reviewed before it was merged.

**What the human work looked like:** directing the scope, catching what the agent missed, and testing
against real behaviour. Examples from this build: the originally planned Groq model was retired mid-build
and was found by testing, not assumed; parallel agent tasks started from an outdated base and were redone
sequentially; the first voice tests exposed a silent mock transcription and a verification rule that let one
report through, and both were fixed by follow-up issues.

**Runtime AI, which is a different thing:** Groq-hosted GPT-OSS 120B and Whisper Large V3 power what the
app itself does when it classifies a report or transcribes a voice note.

## Limitations

- One incident is carried end to end; the other two show routing only.
- Responder behaviour and the timing of acknowledgement are simulated.
- Whisper's Pidgin transcripts are imperfect.
- The confidence score is a transparent heuristic, not a validated model.
- The free-tier model limits how many reports can be processed per minute.
- WhatsApp intake is tested offline with signed test payloads; it has not been tested live with Meta.
- Web reports are anonymous, so independence between them cannot be proven; identical resubmissions are ignored.
- Whisper's Pidgin transcripts are imperfect and can misread short words (for example "don" heard as "don't"); the transcript is kept on the case so a person can check it.
- README additions (by hand, on GitHub)
- Anonymous web reports cannot prove independence; WhatsApp reports are distinguished by hashed sender. Identical resubmissions are not counted twice.
- Whisper's Pidgin transcripts are imperfect and can misread short function words (for example 'don' as 'don't'). The transcript is stored on the case so a human can check it.

## Demo

- **Video (mp4/mov/webm/avi):** [link to demo video]
- **Running it:** locally only; see "Running it locally" above. No hosted instance is needed to evaluate the project.
- **Pitch deck (PDF):** [link to pitch deck]
- **Written summary:** [`SUMMARY.md`](./SUMMARY.md) — track, information sources, approach to trust and
  accuracy, and how AI tools were used

## Project structure

```
relay/
├── BUILD_BRIEF.md        # engineering brief and build plan
├── src/                  # backend
│   ├── app.js            # routes, intake, lifecycle
│   ├── server.js         # entry point
│   ├── db.js             # SQLite case store
│   ├── classifier.js     # Groq classification, retries, fallback
│   ├── confidence.js     # weighted confidence score
│   ├── location.js       # gazetteer and fuzzy place matching
│   ├── transcribe.js     # Groq Whisper voice transcription
│   └── whatsapp.js       # WhatsApp Cloud API webhook
├── public/               # web UI: feed, map, Trust Receipt, demo panel
├── data/                 # locations.json, actors.json (the "add a geography" data)
├── scripts/              # verify.js, demo-run.js, test_ingest.js
├── docs/                 # whatsapp-setup.md, DEMO_RUNBOOK.md
└── README.md
```

## Team

Built by Jafar Alabi Zubair for the Andela x Open Society Foundations "Information You Can Trust"
Peace Tech Innovation Challenge, September 2026.

## License

MIT

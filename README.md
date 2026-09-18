# Relay

**Relay turns trusted community signals into accountable action.**

AI-native signal-to-resolution infrastructure, built for the Andela x Open Society Foundations
*"Information You Can Trust"* Peace Tech Innovation Challenge.

Track: **Safety, Reporting & Protection** (architecture spans all three challenge tracks)

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

Relay takes a report — a threat, a dispute, a service failure — from a WhatsApp message or a
voice note, all the way through to an **independently verified resolution**, with a citizen-facing
record they can hold onto as proof their report entered an accountable process.

```
Signal → Corroborating → Verified → Assigned → Accepted → In Progress
       → Claimed Resolved → Independently Verified
```

A report isn't just routed somewhere and forgotten. It's assigned to a **named responsible
actor** who acknowledges an SLA, and resolution isn't taken on faith — it's confirmed by someone
other than the actor who claimed it.

## The Trust Receipt

Every case produces a record like this — the thing almost no existing African civic-tech tool
gives a citizen today:

```
Case ID: RLA-9281
Status: Independently Verified
Evidence: 3 independent reports + geolocation
Responsible actor: Community security responder
SLA: 30 minutes
Acknowledged: 22 minutes after report
Action: Responders dispersed the situation, no injuries
Resolution: Claimed → Independently Verified (confirmed by a third community member)
Closed: Yes
```

## How it works (this PoC)

1. A report comes in via WhatsApp (test number) or a web chat fallback — text or voice
2. Voice is transcribed (Groq-hosted Whisper Large V3 — free tier, OpenAI-compatible)
3. Claude classifies type, severity, urgency, and which class of actor owns the problem
4. A simplified confidence score combines corroboration, consistency, and evidence
5. The case is assigned to a demo responsible actor, who accepts an SLA
6. The case moves through the status schema above, ending in a status-aware map and case feed
7. One flagship case is carried all the way to Independently Verified, with a Trust Receipt

This is a proof of concept, not a production system. See [`BUILD_BRIEF.md`](./BUILD_BRIEF.md)
for the exact build-vs-roadmap scope line we held ourselves to.

## What's real vs. what's roadmap

**Built for this demo:** intake (text + voice), classification, simplified multi-source
confidence scoring, responsibility assignment, simulated SLA/commitment, the full status
schema, a status-aware map, and the Trust Receipt.

**Deliberately not built — presented as roadmap instead:** real integration with government or
security agencies, crowdfunding/resource mobilization, POS-agent and wearable-device
distribution, and full production-grade access control on sensitive case data. Building these
convincingly in days rather than months would have meant cutting corners on the parts that
actually prove the thesis — so we didn't.

## Designed for real conditions, not a demo environment

- **Low bandwidth:** WhatsApp and voice-note intake work on basic connectivity, not just fast urban internet
- **Accessibility:** voice-first reporting means someone doesn't need to read or type to be heard — this is a deliberate literacy and digital-confidence accommodation, not an incidental feature
- **Multilingual by design:** classification runs through an LLM prompt, not a language-specific model — this demo runs English and Nigerian Pidgin, but the same pipeline extends to French, Arabic, and Portuguese, the languages spoken across the Sahel, DRC, Sudan, and Mozambique, where OSF's own Transformative Peace in Africa initiative operates
- **Privacy and security:** sensitive case data (GBV, whistleblower identity, minors) is designed around information classes that are never surfaced publicly — see the Trust, Safety & Governance section of the full spec
- **Local relevance, clear next steps:** every case is assigned to a locally-relevant responsible actor, and the Trust Receipt tells the reporter exactly what happens next

## Why this, and not just another reporting app

The moat isn't the app — any current LLM can classify "there's a broken water pipe near my
house." The moat is the response network, the institutional relationships, and the verified
case history that accumulate over time. Relay's job is to be the infrastructure underneath
Africa's civic-tech layer, not one more destination app competing with the ones that already
exist.

## Tech stack

| Layer | Choice |
|---|---|
| Classification / routing | Anthropic Claude API |
| Speech-to-text | Groq API (Whisper Large V3, free tier) |
| Backend | Node.js / Express (or FastAPI — see code) |
| Messaging channel | WhatsApp Cloud API (test number) + web chat fallback |
| Map | Leaflet.js + OpenStreetMap |
| Hosting | Render / Railway |

## Running it locally

```bash
git clone https://github.com/<your-username>/relay.git
cd relay
npm install          # or: pip install -r requirements.txt
cp .env.example .env # add your ANTHROPIC_API_KEY and GROQ_API_KEY
npm run dev          # or: uvicorn app:app --reload
```

Open `http://localhost:3000` for the web chat fallback, or message the WhatsApp test number
configured in `.env` once you've added your number as a test recipient in the Meta developer
console.

## Built with AI coding tools

This project was built primarily using [Claude / Antigravity — name the actual tool used] as
the coding agent, directed against [`BUILD_BRIEF.md`](./BUILD_BRIEF.md). The capstone idea
itself was not AI-generated — it came from a multi-pass, human-directed market research process
(see the full concept doc) — in line with the challenge's own rule that AI tools should support
the build, not originate the idea.

## Demo

- **Video (mp4/mov/webm/avi):** [link to demo video]
- **Pitch deck (PDF):** [link to pitch deck]
- **Written summary:** [`SUMMARY.md`](./SUMMARY.md) — track, information sources, approach to
  trust and accuracy, and how AI tools were used

## Project structure

```
relay/
├── BUILD_BRIEF.md      # engineering brief and 5-day build plan
├── src/                # backend: intake, classification, routing, case state
├── public/             # web chat fallback + map + Trust Receipt UI
├── data/                # demo dataset (sample incidents)
└── README.md
```

## Team

Built by Jafar Alabi for the Andela x Open Society Foundations "Information You Can Trust"
Peace Tech Innovation Challenge, September 2026.

## License

MIT

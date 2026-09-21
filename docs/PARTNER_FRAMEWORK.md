# Relay: open resolution infrastructure, the partner framework

**One line:** in payments, a switch lets any bank's customer pay any other bank's customer without every pair of banks building
its own connection. Relay does the same for civic problems: any source can send a signal in, any responder can be assigned to
resolve it, and everyone works from one shared, verifiable record.

## 1. The three sides

| Side | Who | What they do with Relay |
| --- | --- | --- |
| **Sources** (signals in) | Community reporting apps, aggregators and dashboards, NGO field tools, hotlines, WhatsApp and voice notes, government portals | Send a report through one open API and name themselves as the source |
| **The infrastructure** (Relay) | The neutral core | Normalise, classify, find the place, match and merge, corroborate across sources, score confidence, route to an owner with an SLA, track status, require independent verification, issue the receipt, enforce access classes |
| **Responders and oversight** (resolution out) | Government agencies and local government, security and police liaison, NGOs and civil society, community responders and mediators, regulators | Receive assignments, act, report what was done, confirm outcomes, and oversee performance |

Every partner keeps its own front end. What is shared is the **case**, the **rules** and the **proof**.

## 2. What Relay guarantees

- **One case per real-world problem.** Reports about the same place and type from different sources are merged, and every source is listed.
- **A common status schema:** Signal, Corroborating, Verified, Assigned, Accepted, In Progress, Claimed Resolved, Independently Verified.
- **A named owner and an SLA** for every assigned case, taken from configuration, never from model text.
- **No self-certification.** A responder's claim of resolution is shown as a claim; only an independent confirmation closes a case.
- **A record anyone can inspect** (status, owner, SLA, history, sources), with sensitive details masked.

## 3. The integration contract ("the address")

Base URL: `https://<host>/api` (a local run today; the OpenAPI file is `docs/openapi.yaml`).

| Purpose | Call | Status |
| --- | --- | --- |
| Send a signal | `POST /api/reports` with `{ "text": "...", "source": "YourAppName", "lat": ..., "lng": ... }` | Built |
| Send a voice note | `POST /api/reports/voice` (multipart: `audio`, `source`) | Built |
| Read the shared record | `GET /api/cases`, `GET /api/cases/{id}` | Built |
| Receive WhatsApp messages | `POST /webhook` (signed by Meta) | Built (tested offline) |
| Partner keys and source reputation | API keys, per-source rate limits and trust weighting | Roadmap |
| Responder actions | `POST /api/cases/{id}/actions` (accept, update, claim resolved) by authenticated responders | Roadmap (simulated in the demo) |
| Search and related-case lookup | `GET /api/cases?place=&type=&status=` and `GET /api/cases/related?text=` | Roadmap |
| Notifications | Webhooks or subscriptions when a case in a partner's area changes | Roadmap |

**What a partner provides:** the report text (or a voice note), a place or coordinates when known, its source name, and consent to
share the report under the access classes below.
**What a partner gets back:** a case ID, a status, an owner and SLA, and the ability to follow the case to resolution.

Try it now: open `/partner-demo.html` (a page that stands in for other applications), send a report as "CommunityWatch" and another
as "WaterAid Field App", and watch one case gain two sources in the Relay dashboard.

## 4. Responder categories and partnership tiers

| Category | Role in Relay | Connects by | Sees |
| --- | --- | --- | --- |
| Government agencies and local government | Own service failures and public safety issues | Responder account with SLAs (roadmap) | Restricted view for their area |
| Security and police liaison | Own safety threats | Responder account, escalation contacts (roadmap) | Restricted, Protected where designated |
| NGOs and civil society | Own community services, mediation, protection cases | Data partner and responder accounts (roadmap) | Public, Restricted, and Protected for designated organisations |
| Community responders and mediators | First response, local resolution | Trained volunteer accounts (roadmap) | Assigned cases |
| Regulators and oversight bodies | Monitor performance and patterns | Read-only oversight views, aggregate data (roadmap) | Restricted and aggregate |
| Data partners and aggregators | Bring existing signals in | Open API with a source name (built), keys and connectors (roadmap) | Public |

Partnership tiers, in the order they can be onboarded: **1. Data partner** (send signals, read public cases) can start on today's API.
**2. Responder partner** (accept assignments, post actions, meet SLAs). **3. Oversight partner** (regulators: restricted and
aggregate views). **4. Protected-case handler** (organisations designated for sensitive cases).

## 5. Access classes

| Class | Contents | Status |
| --- | --- | --- |
| Public | Masked report text, rounded coordinates, status, owner, SLA, history, sources | Built |
| Restricted | Fuller detail and aggregate data for verified regulators, NGOs and government bodies | Roadmap |
| Protected | Sensitive cases (gender-based violence, whistleblowers, minors), visible only to designated organisations | Designed for, not built |

## 6. How it would be run

1. **Choose a pilot area** and add its places and its responsible actors and SLAs to the two configuration files (`data/locations.json`, `data/actors.json`).
2. **Onboard one or two data partners** who send signals through the open API under their own source name.
3. **Agree responders and SLAs** with agencies and NGOs in each category, in writing, before assigning real cases.
4. **Set the governance:** a data-sharing agreement, a privacy policy, an escalation path for protected cases, and an appeals route for wrong classifications.
5. **Measure in public:** time to acknowledgement, share of cases independently verified, duplicate-merge rate, and resolution times per responder.
6. **Grow by connection, not construction:** every new aggregator or agency adds configuration and a connector, not a new product.

## 7. Trust and governance rules

- **Neutral by design:** Relay does not own the front ends or the response, so partners can compete on service and cooperate on the record.
- **Source accountability:** every report names its source; later, source reputation will weight corroboration so that spam from one source cannot verify a case.
- **Independence:** confirmation must come from someone other than the original reporters and the responder.
- **Privacy first:** masking, hashing of reporter identifiers, rounded coordinates, rate limits, and access classes.
- **Open contract:** the API is published so anyone can integrate, audit and build on it.

## 8. Built today and roadmap

| Built (proof of concept) | Roadmap |
| --- | --- |
| Open intake from any source with a source name; text, voice, WhatsApp | Partner keys, source reputation, rate limits per partner |
| Classification, place matching, matching and merging across sources | Aggregator connectors for existing datasets |
| Corroboration rules and confidence score; independent verification; status schema; Trust Receipt | Responder accounts and integrations; real SLAs |
| Public read API with masking; OpenAPI specification | Restricted and Protected classes; regulator views; search and alerts |
| Simulated responders, clearly labelled | Live WhatsApp rollout, more languages and regions |

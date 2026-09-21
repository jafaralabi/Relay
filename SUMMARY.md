# Relay — Written Summary

**Relay is open resolution infrastructure for civic reporting in Africa: any source in, one verified case, accountable responders out.** Like a payments switch, it lets many tools and many institutions connect once and share one record. It takes a report from a WhatsApp message, a web form, a voice note or another organisation's app all the way to an independently verified resolution, and gives the citizen a Trust Receipt as proof that the report entered an accountable process. The framework for partners is in `docs/PARTNER_FRAMEWORK.md`.

## Track

**Safety, Reporting & Protection** (primary). The architecture is cross-track: the same pipeline handles Stability (a market stall dispute at Mile 12) and Transparency (a broken school borehole at Ijegun), so it also serves the other two challenge tracks.

## Information sources

**1. Landscape research (four passes).** In September 2026 four independent research passes were run on four AI research assistants (Claude, ChatGPT, Perplexity and Gemini) and compared, to map the civic-tech initiatives in each challenge track and find the gaps. The initiatives and organisations they surfaced, and what each contributed to the analysis:

- **Ushahidi (Kenya):** open-source crisis mapping, reported by Ushahidi to have 150,000+ deployments in 160 countries (Rights CoLab case study). It shows both the demand for reporting and the open-source route to distribution, and it stops at a map with no resolution record.
- **BudgIT and Tracka (Nigeria):** budget and project transparency; exposure without a mechanism to compel action.
- **DUBAWA (Centre for Journalism Innovation and Development):** a multilingual WhatsApp claim-checking chatbot. It occupies the claim-verification niche, which ruled out our original concept.
- **U-Report (UNICEF):** messaging and polling with young people; a listening channel rather than a case tracker.
- **Namola, Community Wolf and the GBV Command Centre (South Africa):** safety alerts and case handling that are urban, subscription-based or labour-bound.
- **MajiVoice (Kenya):** a precedent for routing citizen complaints into a utility work-order workflow, limited to the water sector.
- **AlertME (South Sudan), as reported by UNDP:** community alerts linked to peace committees; evidence that linking alerts to responders works, with resolution still well short of full.
- **SeeClickFix (USA):** proof that the citizen-report-to-work-order pattern works at scale, never adapted to African conditions.
- **The May 2026 Andela and OpenAI hackathon** under the Open Society Foundations' Transformative Peace in Africa initiative, whose winning projects clustered in the Safety and Stability tracks (as reported in our research).
- **The challenge brief** (osf-hackathon.vercel.app/brief): the four judging criteria and the seven operating constraints that Relay is designed against.

All four passes reached the same finding: the reporting layer is crowded, and the resolution layer (a named owner, a deadline, independent proof) is missing.

**2. Sources used to size the problem and the users** (retrieved 21 September 2026):

- **Tracking SDG7: The Energy Progress Report 2026** (IEA, IRENA, the World Bank and partners): 563 million people in sub-Saharan Africa lacked electricity in 2024, 86% of the global gap. Used as one measure of the scale of unmet service needs.
- **GSMA, The Mobile Economy Africa 2025 and 2026:** 416 million people use mobile internet in Africa, and 63% of the population lives within mobile broadband coverage but is not yet online. Used to justify low-bandwidth channels (WhatsApp, voice notes).
- **DataReportal, Digital 2026: Nigeria:** 165 million mobile connections and 109 million internet users at the end of 2025. Used to size the first market.
- **DataReportal, We Are Social and Meltwater (via Statista), Q3 2024:** WhatsApp is used by more than 95% of Nigerian internet users aged 16 and over. Used to choose WhatsApp as a primary channel.
- **GSMA, State of the Industry Report on Mobile Money 2026:** 1.2 billion registered mobile money accounts in Africa, 347 million active monthly. Used as evidence that last-mile agent and merchant networks already exist and can distribute Relay.
- **World Bank, Migration and Development Brief (2024):** diaspora remittances to Nigeria were $19.5 billion in 2023, 35% of the flow to sub-Saharan Africa. Used to size the diaspora that already supports communities at home.
- **Nigeria's constitutional structure:** 36 states, the Federal Capital Territory and 774 local government areas. Used to count possible responders.

**3. What classification and routing are grounded in.** Three sources, all in the repository:

- prompts that define the three incident types (Safety, Stability, Transparency) and the severity and urgency levels;
- `data/actors.json`, which says which class of actor owns each type and severity and what response time (SLA) applies;
- `data/locations.json`, a small Lagos gazetteer (Agege market, Mile 12 market, Ijegun, Oshodi, Ikorodu) used to match places, including misspelt ones.

**4. Demo data.** Three incidents written for the demo, in English and Nigerian Pidgin: an armed group near Agege market, a stall dispute at Mile 12 market, and a broken borehole at Ijegun primary school. No real personal data is used, and the app warns visitors not to enter any.

**5. What is illustrative.** The named actors and their SLAs are configuration for the proof of concept, not agreements with real institutions. The impact arithmetic in the pitch deck (1% of Nigeria's internet users filing one report a year is about 1.1 million cases) is an illustration, not a forecast.

## Approach to trust and accuracy

Trust is designed into the case lifecycle and checked by automated tests.

- **One report is never enough.** A single report is capped at low confidence and stays at Signal. A case is verified only with at least two independent reports, and confidence reaches 100 only after independent verification.
- **The model does not decide who acts.** The responsible actor, the SLA and the confidence score come from configuration and the scoring code, never from model text. Model output is validated before use.
- **Claimed is not verified.** A responder's claim ("Claimed Resolved", shown in violet) is different from an independent confirmation ("Independently Verified", shown in green). The confirmation is judged by the model and must come from someone other than the original reporters and the responder.
- **Verification fails safe.** If the model is unavailable, the case is left unchanged and the request returns an error. There is no keyword shortcut.
- **No silent fakes.** If classification falls back to keywords, the case is flagged and shown with a badge, and test runs that used the fallback are reported as invalid.
- **Duplicates and closed cases.** Identical resubmissions are ignored, a closed case is never reopened, and a report with no stated place is never given one.
- **Privacy and safety.** Phone numbers and email addresses are masked, reporter identifiers are hashed and never returned, public coordinates are rounded, intake is rate limited, demo controls need a key, the WhatsApp webhook checks Meta's signature, and text from visitors is always shown as plain text.
- **Open by design, many sources.** The API is published as an OpenAPI specification. Any organisation's app can send signals into the same registry and name itself as the source; reports about the same problem from different sources are merged into one case that lists every source, and anyone can look up what was reported, who owns it and what was done. Built today: open intake with source attribution, matching and merging across sources, and a public read API with masking (a simulated partner-app page, `/partner-demo.html`, demonstrates it). Roadmap, not built: partner API keys, verified regulator and NGO accounts, and confidentiality classes so that sensitive cases are visible only to designated organisations.
- **Open source and embeddable.** The code is MIT-licensed. The API is the open standard, the dashboard, form, WhatsApp intake and an embeddable widget are open-source clients, and the shared infrastructure (registry, verification, connections) is the layer that stays maintained. A service that reaches last-mile communities can embed the widget with one line and offer problem reporting as a value-added service; its reports join the shared record under its name (a simulated partner website, `/embed-demo.html`, demonstrates this). The framework is to be co-designed with the Open Society Foundations and other partners.
- **Everything simulated is labelled.** Responder acceptance and timing, the scripted routing for the Mile 12 and Ijegun demo reports, and seeded sample cases carry visible badges.
- **Evidence.** 31 offline checks (no network or key) and 25 live-model checks pass, and the live run reports that no keyword fallback was used.
- **Known limits.** Pidgin speech transcripts are imperfect (in one test "don" was heard as "don't"), so the transcript is kept on each case for a person to check. Web reports are anonymous, so independence between them cannot be proven. The confidence score is a transparent heuristic, not a validated model. WhatsApp intake has been tested offline but not yet live with Meta.

## How we used AI tools

- **Idea origination.** I chose the problem, the concept (Relay) and its scope myself. I used AI assistants (Claude, ChatGPT, Perplexity and Gemini) to research what problems exist in African civic tech and to compare existing initiatives. The assistants also made recommendations; the decision to build Relay, and its design and scope, were mine, and the design developed well beyond those recommendations (for example the open, embeddable infrastructure model). The challenge asks that AI not be used to generate the capstone idea, so this section states exactly where AI was and was not used.
- **Build.** Most of the code was written by **Jules**, Google's asynchronous coding agent. Each piece was a GitHub issue written against `BUILD_BRIEF.md`, and it came back as a pull request that the author reviewed and tested before merging. Each piece was merged as a reviewed pull request, covering intake, classification, corroboration, voice, WhatsApp, the web interface, the case lifecycle and the demo-recording tool. **Claude** (Anthropic) was used as an engineering partner: planning the issue breakdown, reviewing code, writing the offline test suites, and writing three tested patch scripts that applied late fixes. The issues and pull requests in the repository are the record.
- **What the human work was.** Setting the scope, reviewing every change, and testing against real behaviour. Testing caught the planned language model being retired mid-build, parallel agent tasks built on stale code (redone in sequence), keyword fallbacks that faked verification and places (removed), and a security header that silently blocked the map tiles (fixed).
- **Runtime AI (separate from the tools that built the app).** Groq-hosted `openai/gpt-oss-120b` classifies reports and checks independent confirmations, and Groq-hosted Whisper Large V3 transcribes voice notes.

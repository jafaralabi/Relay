# Relay — Written Summary

**Relay is open resolution infrastructure for civic reporting in Africa: any source in, one verified case, accountable responders out.** Like a payments switch, it lets many tools and many institutions connect once and share one record. It takes a report from a WhatsApp message, a web form, a voice note or another organisation's app all the way to an independently verified resolution, and gives the citizen a Trust Receipt as proof that the report entered an accountable process. The framework for partners is in `docs/PARTNER_FRAMEWORK.md`.

## Track

**Safety, Reporting & Protection** (primary). The architecture is cross-track: the same pipeline handles Stability (a market stall dispute at Mile 12) and Transparency (a broken school borehole at Ijegun), so it also serves the other two challenge tracks.

## Information sources

- **Problem research.** A landscape review of African civic-tech tools (Ushahidi, BudgIT, U-Report, DUBAWA, Namola) across four research passes. Every pass found the same gap: strong signal capture, but no end-to-end path from signal to resolution.
- **What classification and routing are grounded in.** Three sources, all in the repository:
  - prompts that define the three incident types (Safety, Stability, Transparency) and the severity and urgency levels;
  - `data/actors.json`, which says which class of actor owns each type and severity and what response time (SLA) applies;
  - `data/locations.json`, a small Lagos gazetteer (Agege market, Mile 12 market, Ijegun, Oshodi, Ikorodu) used to match places, including misspelt ones.
- **Demo data.** Three incidents written for the demo, in English and Nigerian Pidgin: an armed group near Agege market, a stall dispute at Mile 12 market, and a broken borehole at Ijegun primary school. No real personal data is used, and the app warns visitors not to enter any.
- **What is illustrative.** The named actors and their SLAs are configuration for the proof of concept. They are not agreements with real institutions.

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
- **Everything simulated is labelled.** Responder acceptance and timing, the scripted routing for the Mile 12 and Ijegun demo reports, and seeded sample cases carry visible badges.
- **Evidence.** 31 offline checks (no network or key) and 25 live-model checks pass, and the live run reports that no keyword fallback was used.
- **Known limits.** Pidgin speech transcripts are imperfect (in one test "don" was heard as "don't"), so the transcript is kept on each case for a person to check. Web reports are anonymous, so independence between them cannot be proven. The confidence score is a transparent heuristic, not a validated model. WhatsApp intake has been tested offline but not yet live with Meta.

## How we used AI tools

- **Idea origination.** The capstone idea was not AI-generated. It came from a multi-pass, human-directed market research process, in line with the challenge rule that AI tools should support the build, not originate the idea.
  > **[CONFIRM BEFORE SUBMITTING — delete this note after checking.]** Please make sure this paragraph states exactly how AI tools were and were not used in the idea stage (for example whether an AI assistant was used to gather or summarise research, and who chose Relay and its scope). Edit the wording so it is literally true.
- **Build.** Most of the code was written by **Jules**, Google's asynchronous coding agent. Each piece was a GitHub issue written against `BUILD_BRIEF.md`, and it came back as a pull request that the author reviewed and tested before merging. Each piece was merged as a reviewed pull request, covering intake, classification, corroboration, voice, WhatsApp, the web interface, the case lifecycle and the demo-recording tool. **Claude** (Anthropic) was used as an engineering partner: planning the issue breakdown, reviewing code, writing the offline test suites, and writing three tested patch scripts that applied late fixes. The issues and pull requests in the repository are the record.
- **What the human work was.** Setting the scope, reviewing every change, and testing against real behaviour. Testing caught the planned language model being retired mid-build, parallel agent tasks built on stale code (redone in sequence), keyword fallbacks that faked verification and places (removed), and a security header that silently blocked the map tiles (fixed).
- **Runtime AI (separate from the tools that built the app).** Groq-hosted `openai/gpt-oss-120b` classifies reports and checks independent confirmations, and Groq-hosted Whisper Large V3 transcribes voice notes.

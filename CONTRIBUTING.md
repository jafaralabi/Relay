# Contributing to Relay

Relay is open resolution infrastructure for civic reporting in Africa. Contributions that make it easier for organisations
to connect, and safer for the people who report, are welcome.

## Good first contributions
- **Add a place or a city:** extend `data/locations.json` (names, aliases, coordinates) and `data/actors.json` (who owns each kind of problem, and the SLA).
- **Add a language:** improve the classification prompt and the Whisper prompt for a language or dialect, with test reports.
- **Build a connector:** bring signals from an existing tool or dataset into `POST /api/reports` under its own `source` name.
- **Improve the widget:** `public/embed.js` (accessibility, translations, styling options).
- **Report a bug or a trust problem:** open an issue with the steps to reproduce.

## Running it
```bash
npm install
cp .env.example .env      # add GROQ_API_KEY
npm start                 # http://localhost:3000
node scripts/test-offline.js     # no key or network needed
node scripts/test-sources.js
node scripts/test-embed.js
```

## Principles
1. **Never fake a verification.** If the model is unavailable, the case is left unchanged.
2. **Label what is simulated.** Anything scripted or simulated must say so in the interface.
3. **Privacy first.** No personal data in logs, masked public output, hashed reporter identifiers.
4. **Keep the contract open.** Changes to the API or case schema are described in `docs/openapi.yaml` in the same pull request.
5. **Test what you change.** Add or update an offline test, and keep the existing ones passing.

## Pull requests
Keep them small and focused, explain what changed and why, and include the test output. By contributing you agree that your
contribution is licensed under the MIT licence.

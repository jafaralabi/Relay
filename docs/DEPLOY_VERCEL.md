# Deploying Relay to Vercel

Vercel runs the app as a serverless function. That has one important consequence: **the database lives in `/tmp`, which is
temporary and not shared between instances.** A hosted Relay is therefore a *demo instance*: it starts with the three sample
cases, and anything visitors add can disappear when the function restarts. The repository's tests and the demo video show the
full, persistent behaviour when Relay runs locally.

## What is already prepared in the repository
- `app.js` (root): Vercel's entry point. It seeds the sample cases when the temporary database is empty.
- `public/`: served by Vercel's CDN (the web page, the map, the demo panel).
- `src/sqlite-compat.js`: uses `better-sqlite3`, or Node's built-in SQLite if the native module cannot load.
- `HOSTED_READONLY=true`: optional mode that keeps the sample cases visible but accepts no new reports.

## Steps
1. Sign in to Vercel. Choose **Add New > Project** and import `jafaralabi/Relay`. When GitHub asks which repositories Vercel may
   access, allow **only this repository**.
2. Leave the framework preset on Express (it is detected), and leave the build command and output directory empty.
3. Add the environment variables below (Production), then click **Deploy**.
4. Open the deployment URL and run the checks in the next section.

### Environment variables
| Name | Value | Mark as Sensitive |
| --- | --- | --- |
| `GROQ_API_KEY` | your Groq key | **Yes** |
| `DEMO_KEY` | a long random value (for example 32 random characters) | **Yes** |
| `REPORTER_SALT` | another long random value | **Yes** |
| `DATABASE_PATH` | `/tmp/relay.db` | No |
| `SEED_ON_EMPTY` | `true` | No |
| `NODE_ENV` | `production` | No |
| `HOSTED_READONLY` | `true` to show only the sample cases; leave unset to let visitors submit reports | No |

Do not set `DEMO_MODE` or any `WHATSAPP_*` variable. With `NODE_ENV=production` and no `WHATSAPP_APP_SECRET`, the WhatsApp
webhook refuses every request, which is what you want here. Turn on the **Sensitive** option for the three secrets: in April 2026
Vercel disclosed an incident in which environment variables that were not marked sensitive may have been exposed.

## Checks after deploying
- `https://<your-project>.vercel.app/api/health` returns `status: ok`.
- `https://<your-project>.vercel.app/` shows the page and a map with tiles, and the feed lists three sample cases (Agege market
  Independently Verified, Mile 12 market Accepted, Ijegun Assigned), each marked as a sample.
- If reports are allowed: submit the English Agege report from the demo video script. It should appear as a new case within a few seconds.
- If `HOSTED_READONLY=true`: submitting shows "This hosted demo is read-only".

## Limits to know about
- **Temporary data.** A restart, a new instance or a new deployment resets the database to the three sample cases. Two visitors may
  even be served by different instances.
- **Demo controls.** `/demo.html` works only with `DEMO_KEY`. Do not publish that key; the lifecycle demo is in the video.
- **Request size.** Vercel limits request bodies to about 4.5 MB, so large voice notes are refused before they reach the app.
- **WhatsApp** is not supported on the hosted instance.
- **Shared model quota.** Every visitor uses the same Groq quota (about 8,000 tokens per minute on the free tier). Use
  `HOSTED_READONLY=true` if you want to protect it.

## If the deployment fails
- **Build error about `better-sqlite3`:** the fallback should keep the app running; look for "[DB] better-sqlite3 unavailable" in the runtime logs.
- **"Cannot find module" or a blank page:** check that the project root is the repository root and that `app.js` is listed in the deployment's source.
- **Function errors on the first request:** open **Deployments > Functions logs** in Vercel and read the first error line.

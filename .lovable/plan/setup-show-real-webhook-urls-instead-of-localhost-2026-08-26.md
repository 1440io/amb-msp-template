# Setup: show real webhook URLs instead of localhost

## Problem

The Setup page builds the webhook URL from the origin of the incoming request. When the page renders inside the editor's dev preview, that origin is `http://localhost:8080`, so the copyable value can't be pasted into the 1440 console.

## What changes

Setup will show two labeled, copyable webhook URLs built from the project's stable Lovable hostnames:

- **Production** (paste this in the 1440 console for live traffic):
  `https://project--28feeade-662c-4c56-be4d-a0a3f929a761.lovable.app/api/public/msp-webhook`
- **Preview** (for testing before publishing):
  `https://project--28feeade-662c-4c56-be4d-a0a3f929a761-dev.lovable.app/api/public/msp-webhook`

Each row gets its own copy button and a one-line hint explaining when to use it. A localhost URL is never displayed.

When the app is served from a real public host (published site, preview host, or a custom domain), that request origin is used for the production row so a custom domain shows its own URL rather than the `lovable.app` fallback.

## Technical notes

- `readSetupStatus(origin)` in `src/lib/msp.server.ts` returns `webhookUrl` today. It will instead return `webhookUrls: { production, preview }`, derived from the stable project host constants, using the request origin for `production` only when its hostname is not `localhost`/`127.0.0.1`.
- The stable hosts live in one exported constant in the same server module (they are public URLs, not secrets).
- `getSetupStatus` in `src/lib/msp.functions.ts` keeps passing the request origin; only the returned shape changes.
- `src/routes/_authenticated/setup.tsx` renders the two rows with independent copy handlers, replacing the single `status.webhookUrl` block.
- No database, credential, or webhook-handler behavior changes; the route path `/api/public/msp-webhook` stays as is.

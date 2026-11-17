# LendLoop

LendLoop is a neighborhood tool-lending board. Neighbors list tools they are willing to lend, request a date range, and n8n sends the request notification and the daily overdue reminder.

Borrow what you need. Lend what you don't.

## Stack

- Next.js App Router and TypeScript
- Clerk for sign-in
- Convex for data and for the rules that decide who can do what
- n8n, self-hosted with Docker Compose, for the two automations

## Local setup

You need Node 20+, Docker, and accounts at [Clerk](https://dashboard.clerk.com) and [Convex](https://dashboard.convex.dev). n8n does not need an account; it runs on your machine.

### 1. Install

```bash
npm install
cp .env.example .env.local
cp .env.example .env
```

`.env.local` is for Next.js. `.env` is what Docker Compose reads. Fill both in as you go. Neither file is committed.

### 2. Clerk

1. Create a Clerk application.
2. In the Clerk dashboard, enable the Convex integration. That creates a JWT template named `convex`.
3. Copy the publishable key and secret key into `.env.local` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
4. Copy the Frontend API URL (it looks like `https://your-app.clerk.accounts.dev`). You will set it on Convex in the next step as `CLERK_JWT_ISSUER_DOMAIN`.
5. Open a user in the Clerk dashboard and copy their user id (`user_...`). That id is how you become the admin.

The sign-in and sign-up routes are `/sign-in` and `/sign-up`. After either one, Clerk sends you to `/board`.

### 3. Convex

```bash
npx convex dev
```

The first run creates a deployment and writes `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. Leave that process running while you develop. In another terminal:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set LENDLOOP_HMAC_SECRET "$(openssl rand -hex 32)"
npx convex env set ADMIN_CLERK_IDS user_your_clerk_id
```

Copy the same `LENDLOOP_HMAC_SECRET` into `.env` for n8n. Find the HTTP Actions URL in the Convex dashboard (it ends in `.convex.site`) and set it as `CONVEX_SITE_URL` in `.env`.

`N8N_REQUEST_WEBHOOK_URL` is set in the next step, after n8n has a URL Convex can reach.

Generated Convex files in `convex/_generated` are committed so `npm run typecheck` works before the first login. `npx convex dev` refreshes them.

### 4. n8n

```bash
# in .env
# LENDLOOP_HMAC_SECRET must match the Convex env var
# CONVEX_SITE_URL=https://your-deployment.convex.site
# N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
docker compose up -d
```

Open http://localhost:5678 and create the owner account when n8n asks. Then:

1. Import these files from `n8n/workflows`:
   - `request-notification.json`
   - `overdue-reminders.json`
   - `error-handler.json`
2. On **LendLoop Request Notification** and **LendLoop Overdue Reminders**, open the workflow menu, choose Settings, and set Error workflow to **LendLoop Error Handler**. n8n stores that link by id, so it cannot be baked into the export.
3. Publish both workflows. The request webhook path is `lendloop-request`. The production URL is `http://localhost:5678/webhook/lendloop-request`.
4. The reminder workflow is scheduled for 08:00 UTC. Use "Execute workflow" to run it once while you are testing.

Convex Cloud cannot call `localhost`. For the request notification, expose n8n with a tunnel (Cloudflare Tunnel or ngrok) and set the public production URL on Convex:

```bash
npx convex env set N8N_REQUEST_WEBHOOK_URL https://your-tunnel.example/webhook/lendloop-request
```

n8n calling Convex does not need a tunnel. `CONVEX_SITE_URL` is already public.

The Code nodes read `$env.LENDLOOP_HMAC_SECRET` and, for the reminder and error workflows, `$env.CONVEX_SITE_URL`. Compose sets `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and `NODE_FUNCTION_ALLOW_BUILTIN=crypto` so those nodes can sign requests. If a Code node reports that `crypto` is blocked, recreate the container after confirming those two variables are present.

### 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000. The public page lists tool names and categories only. Sign in to list a tool, request a date range, approve or decline an incoming request, and mark a loan returned.

To promote yourself, set `ADMIN_CLERK_IDS` to your Clerk user id and reload `/board`. The profile sync promotes matching ids. It never demotes anyone, and there is no client argument that sets a role.

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Clerk browser key |
| `CLERK_SECRET_KEY` | `.env.local` | Clerk server key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and the matching sign-up / redirect vars | `.env.local` | Route Clerk to `/sign-in`, `/sign-up`, and `/board` |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex client URL (`.convex.cloud`) |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env | Clerk Frontend API URL, used to verify session tokens |
| `LENDLOOP_HMAC_SECRET` | Convex env and `.env` | Shared HMAC secret. Same value on both sides. Not committed. |
| `N8N_REQUEST_WEBHOOK_URL` | Convex env | Public n8n production webhook |
| `ADMIN_CLERK_IDS` | Convex env | Comma-separated Clerk user ids that are admins |
| `CONVEX_SITE_URL` | `.env` | Convex HTTP Actions URL (`.convex.site`) |
| `N8N_ENCRYPTION_KEY` | `.env` | Encrypts n8n's local credential store |

`N8N_REQUEST_WEBHOOK_URL` is not required for the board itself. Without it, creating or updating a loan still works, and the scheduled notification action fails visibly in the Convex logs instead of pretending the webhook was sent.

## Architecture

```text
Browser
  ├─ Clerk session
  ├─ Next.js App Router
  └─ Convex queries and mutations (Clerk JWT)

Public page
  └─ tools.listPublic  →  { name, category } only

Signed-in board
  └─ listings, requests, approvals, returns
       every check runs inside the Convex function

Loan created or status changed
  └─ Convex action signs the body (HMAC-SHA256)
       └─ n8n webhook verifies the signature
            └─ logs a mock notification with six fields

Daily 08:00 UTC
  └─ n8n signs a request
       └─ POST {CONVEX_SITE_URL}/overdue
            └─ for each overdue loan, log a reminder
                 └─ POST /reminders with idempotency key reminder:{loanId}:{utcDate}

Either workflow fails after retries
  └─ LendLoop Error Handler
       └─ POST /automation-errors
            └─ admin view lists the failure
```

Convex HTTP routes (`convex/http.ts`):

- `POST /overdue` returns approved loans whose end date is before today (UTC).
- `POST /reminders` records one reminder per loan per UTC day.
- `POST /automation-errors` records a failed n8n execution.

All three refuse a body that is not signed with `LENDLOOP_HMAC_SECRET`. The signature covers `timestamp + "." + rawBody`. Timestamps older or newer than five minutes are rejected after the signature matches, so a captured request cannot be replayed. Comparison of the hex digest does not stop at the first differing character.

n8n retries each Convex HTTP call up to four times. The reminder write-back key is `reminder:{loanId}:{YYYY-MM-DD}`. A retry returns the existing event instead of inserting another one. The same is true for a repeated failure report (`error:{workflow}:{executionId}`) and for a repeated outbound notification (`notify:{loanId}:{status}`).

## Security and data minimization

Role checks live in `convex/lib/rbac.ts` and are called by the Convex functions. The UI hides buttons a person should not use. That is not the boundary.

- A user can create, edit, and delete only their own listings.
- An admin can remove any listing, read every loan, and mark or clear Trusted Lender. An admin cannot edit the text of someone else's listing.
- A user can request a tool they do not own, cancel their own pending request, and decide only pending requests on tools they own.
- The lender or the borrower can mark an approved loan returned.
- There is no mutation that accepts a role. Admin comes from `ADMIN_CLERK_IDS` when the profile sync runs.
- A listing with a pending or approved loan cannot be removed until that loan is resolved. Removed listings stay in the database so older loans still have a name, and they disappear from both the public page and the catalog.

The public query returns `name` and `category` only. The signed-in catalog adds condition, description, availability, and the lender's display name plus a trusted badge, because the borrower is choosing a person. Email addresses are not stored in Convex and are not sent to n8n.

The request webhook carries `event`, `idempotencyKey`, `loanId`, `recipientUserId`, `status`, and `toolName`. It does not carry the description, the date range, or the other party's name. The overdue payload carries the loan id, tool name, borrower id, end date, and how many days late it is. The error workflow forwards the workflow name, the execution id, and a 300-character error message. It does not forward the original payload.

Secrets stay in Convex env vars and in the n8n process environment. The exported workflow JSON references `$env.LENDLOOP_HMAC_SECRET` and `$env.CONVEX_SITE_URL`. It does not contain the secret. `npm test` checks that.

## Tests

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The tests cover the role matrix, HMAC verification (tampered body, wrong secret, stale timestamp), idempotency keys, the agreement between the Convex signer and the n8n signer, the shape of the exported workflows, and Convex functions for cross-user removal, approval, trusted-lender changes, unsigned HTTP calls, and duplicate reminder write-backs.

## What I would change for production

- Run n8n on a private network. Put the webhook behind a tunnel or an internal load balancer, and move Code-node execution to n8n's external task runners so a workflow cannot read the n8n database. Pass the HMAC secret through an n8n credential rather than turning off `N8N_BLOCK_ENV_ACCESS_IN_NODE`.
- Separate Convex dev and prod deployments, with a separate HMAC secret and a Clerk production instance. Rotate the secret by accepting the previous key for a short window.
- Page the tool and loan queries, and rate-limit borrow requests per user.
- Resolve the notification channel inside Convex, or in a system that already has the person's consent, and send n8n only an opaque recipient id. Email or Slack would be a later step, not something stored for the sake of the demo.
- Keep an audit row for admin removals and trusted-lender changes.
- Alert a person when the error workflow writes a failure, instead of only showing it in the admin screen and the n8n execution list.
- Treat dates in the neighborhood's timezone. The demo uses UTC calendar dates so the app and the daily job agree.
- Add security headers and a lock on who can open the n8n editor. The local compose file leaves n8n's first-run owner setup in place on purpose; a shared host would not.

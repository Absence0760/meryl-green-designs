# Running locally

This guide walks through getting both the frontend and backend running on your
machine for development.

## Prerequisites

- **Node.js 20 or later** — check with `node --version`
- **pnpm 9 or later** — check with `pnpm --version`, install with
  `npm install -g pnpm` if missing
- A **Resend API key** — free at [resend.com](https://resend.com). Not strictly
  required to run the servers, but the order form will fail to send emails
  without one.

## One-time setup

From the repository root:

```bash
pnpm install
```

This installs dependencies for both workspace packages (`frontend/` and
`backend/`) into a single hoisted `node_modules` at the root.

Copy the example env files and fill them in:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at minimum:

- `RESEND_API_KEY` — your Resend API key
- `FROM_EMAIL` — a verified sender in your Resend account (e.g. a Resend
  sandbox address, or `orders@yourdomain.com` once the domain is verified)
- `OWNER_EMAIL` — where order notifications go (your inbox while developing)

`frontend/.env` should already contain `PUBLIC_API_URL=http://localhost:3001` —
no changes needed for local dev.

## Running both servers

From the repository root:

```bash
pnpm dev
```

This runs `pnpm -r --parallel run dev`, which starts both packages concurrently:

- **Frontend** — [http://localhost:7777](http://localhost:7777) (Vite dev server
  with HMR)
- **Backend** — [http://localhost:3001](http://localhost:3001) (`tsx watch`
  auto-reloading Hono server)

Press `Ctrl+C` once to stop both.

## Running them individually

Useful when you only want one side running.

```bash
pnpm frontend dev         # frontend only
pnpm backend dev          # backend only
```

These are shortcuts for `pnpm --filter @meryl-green-designs/{frontend,backend}`.

## Smoke test

With both servers running:

1. Open http://localhost:7777 — the home page should load.
2. Navigate to **Shop**, scroll to **Order form**, fill it in and submit.
3. Backend terminal should log the request. If email is configured, two emails
   arrive shortly (owner + customer).
4. If email is not configured, the browser shows an error — the rest of the
   site still works.

You can also hit the backend directly:

```bash
curl http://localhost:3001/health
# {"ok":true}

curl -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"you@example.com","address":"1 Test St","items":"1 x widget"}'
```

## Type-checking and linting

```bash
pnpm check                # runs check in both packages
pnpm frontend check       # svelte-check + tsc on frontend
pnpm backend check        # tsc --noEmit on backend
```

Do this before committing. Both should report 0 errors.

## Building

```bash
pnpm build                # builds both packages
pnpm frontend build       # emits frontend/build/ (static site for S3)
pnpm backend build        # emits backend/dist/ (compiled JS for Lambda)
```

## Common issues

**`PUBLIC_API_URL` is not defined at build time**
: The frontend inlines `PUBLIC_API_URL` at build time via `$env/static/public`.
  If `frontend/.env` is missing or the variable is unset, the build fails. Copy
  `.env.example` to `.env`.

**CORS errors in the browser when submitting the order form**
: `ALLOWED_ORIGINS` in `backend/.env` must include the frontend origin. For
  local dev this is `http://localhost:7777` (the default).

**Port already in use**
: Frontend dev server is hard-coded to port 7777 in `frontend/package.json`.
  Backend respects the `PORT` env var; change it in `backend/.env` if 3001 is
  taken.

**Emails not arriving**
: Check `RESEND_API_KEY` is valid and `FROM_EMAIL` is from a verified domain in
  your Resend dashboard. During initial setup, Resend's sandbox address
  (`onboarding@resend.dev`) is the fastest way to test.

**Order form fails silently**
: Open the browser devtools Network tab. The request to `/orders` will show the
  actual error from the backend. Common cause: missing `OWNER_EMAIL` in
  `backend/.env`.

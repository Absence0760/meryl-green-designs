# Running locally

This guide walks through getting the frontend, backend, and (optionally) the
Sanity Studio running on your machine for development.

For deploying to AWS, see [`deployment.md`](./deployment.md) instead.

## Prerequisites

- **Node.js 20 or later** — check with `node --version`
- **pnpm 9 or later** — check with `pnpm --version`, install with
  `npm install -g pnpm` if missing
- A **Resend API key** — free at [resend.com](https://resend.com). Not strictly
  required to run the servers, but the order form will fail to send emails
  without one.
- A **Sanity project** — free at [sanity.io](https://www.sanity.io/manage).
  Optional for running the site locally (the shop will show an empty state
  without it), but required for managing products.

## One-time setup

From the repository root:

```bash
pnpm install
```

This installs dependencies for all three workspace packages (`frontend/`,
`backend/`, `studio/`) into a single hoisted `node_modules` at the root.

Copy the example env files and fill them in:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
cp studio/.env.example studio/.env
```

Edit `backend/.env` and set at minimum:

- `RESEND_API_KEY` — your Resend API key
- `FROM_EMAIL` — a verified sender in your Resend account (e.g. a Resend
  sandbox address, or `orders@yourdomain.com` once the domain is verified)
- `OWNER_EMAIL` — where order notifications go (your inbox while developing)

`frontend/.env` contains `PUBLIC_API_URL=http://localhost:3001` (leave as-is
for local dev) and `PUBLIC_SANITY_PROJECT_ID` / `PUBLIC_SANITY_DATASET`. The
Sanity values can stay empty for initial setup — the shop page will render
with an empty product list.

### Setting up Sanity (optional, but required for managing products)

1. Log in at https://www.sanity.io/manage and click **Create new project**.
2. Give it a name (e.g. "Meryl Green Designs") and choose the default dataset
   `production`.
3. Copy the **Project ID** shown on the project dashboard.
4. Paste the project ID into **both**:
   - `studio/.env` → `SANITY_STUDIO_PROJECT_ID=...`
   - `frontend/.env` → `PUBLIC_SANITY_PROJECT_ID=...`
5. Start the studio with `pnpm studio dev` (see below).
6. Log into the studio in your browser, create some products, and click
   **Publish**.
7. Rebuild the frontend (`pnpm frontend build` or restart `pnpm dev`) and the
   products will appear on the shop page.

## Running the site

From the repository root:

```bash
pnpm dev
```

This starts the frontend and backend in parallel:

- **Frontend** — [http://localhost:7777](http://localhost:7777) (Vite dev server
  with HMR)
- **Backend** — [http://localhost:3001](http://localhost:3001) (`tsx watch`
  auto-reloading Hono server)

Press `Ctrl+C` once to stop both.

The studio is deliberately excluded from `pnpm dev` because it's heavy and
isn't needed for most site development. Run it separately when you need it.

## Running the studio

```bash
pnpm studio dev
```

This starts Sanity Studio on [http://localhost:3333](http://localhost:3333).
Sign in with the Sanity account that owns the project. Any products you
create/edit and publish become visible to the frontend on the next build.

To publish the studio so Meryl can use it from anywhere:

```bash
pnpm studio deploy
```

Sanity will prompt for a subdomain (e.g. `merylgreendesigns`) and deploy to
`https://merylgreendesigns.sanity.studio`. Free, no AWS involved.

## Running all three at once

Only needed if you're actively developing the studio schema at the same time
as the site.

```bash
pnpm dev:all
```

## Running packages individually

```bash
pnpm frontend dev         # frontend only
pnpm backend dev          # backend only
pnpm studio dev           # studio only
```

These are shortcuts for `pnpm --filter @meryl-green-designs/{frontend,backend,studio}`.

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
pnpm check                # runs check in all three packages
pnpm frontend check       # svelte-check + tsc on frontend
pnpm backend check        # tsc --noEmit on backend
pnpm studio check         # tsc --noEmit on studio
```

Do this before committing. All three should report 0 errors.

## Building

```bash
pnpm build                # builds all three packages
pnpm frontend build       # emits frontend/build/ (static site for S3)
pnpm backend build        # emits backend/dist/lambda.mjs (esbuild bundle for Lambda)
pnpm studio build         # emits studio/dist/ (React SPA, for self-hosted deploys)
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

**Shop page shows "No products are listed yet" even after adding products**
: Three common causes: (1) `PUBLIC_SANITY_PROJECT_ID` is empty or wrong in
  `frontend/.env`; (2) the products were saved as drafts in the studio but
  not published — click the **Publish** button in the studio; (3) the frontend
  hasn't been rebuilt since the content was published — restart `pnpm dev` or
  run `pnpm frontend build`.

**Studio fails to start with "SANITY_STUDIO_PROJECT_ID is not set"**
: You haven't created `studio/.env` or you left `SANITY_STUDIO_PROJECT_ID`
  empty. Follow the Sanity setup steps above.

## Next step: deploying

Once the site runs correctly on your machine, see
[`deployment.md`](./deployment.md) for the first-time AWS deployment
walkthrough (Terraform apply, GitHub Actions setup, Sanity webhook wiring).

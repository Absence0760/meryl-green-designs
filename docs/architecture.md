# Architecture

## Overview

Meryl Green Designs is a static brochure site with a small serverless backend for
handling order submissions. It is a pnpm workspace with two packages:

- `frontend/` — SvelteKit (Svelte 5), built with `@sveltejs/adapter-static`. Ships as
  pre-rendered HTML + assets.
- `backend/` — Hono app, written once and deployed two ways: as a local Node HTTP
  server for development and as an AWS Lambda handler for production.

The frontend and backend are fully decoupled. The frontend knows the backend only by
its URL, passed in at build time via the `PUBLIC_API_URL` environment variable.

## Repo layout

```
meryl-green-designs/
├── package.json              Workspace root scripts (dev/build/check)
├── pnpm-workspace.yaml       Lists frontend and backend as packages
├── docs/                     This documentation
├── frontend/
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── .env.example          PUBLIC_API_URL
│   └── src/
│       ├── app.css           Base styles + theme tokens
│       ├── app.html
│       └── routes/
│           ├── +layout.svelte       Header, nav, under-construction banner, footer
│           ├── +layout.ts           export const prerender = true
│           ├── +page.svelte         Home: hero / story / poem
│           ├── gallery/+page.svelte
│           ├── shop/+page.svelte    Products + order form + EFT details
│           └── contact/+page.svelte
└── backend/
    ├── package.json
    ├── tsconfig.json
    ├── .env.example          RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL, ALLOWED_ORIGINS
    └── src/
        ├── app.ts            Hono app factory + CORS + route mounting
        ├── server.ts         Local dev entry (runs on :3001)
        ├── lambda.ts         AWS Lambda entry (wraps app with hono/aws-lambda)
        ├── email.ts          Resend API wrapper + HTML escaping
        └── routes/
            └── orders.ts     POST /orders — validate + send emails
```

## Frontend

SvelteKit with `adapter-static`. Every route has `prerender = true` (set in
`+layout.ts`), so the build emits one real `.html` file per route:

```
build/
├── _app/           JS chunks, CSS, fonts
├── index.html
├── gallery.html
├── shop.html
└── contact.html
```

This is the directory that uploads to S3. CloudFront sits in front for caching and
TLS termination. No server-side rendering, no runtime, no Node process.

The shop page includes client-side JavaScript that submits the order form to the
backend via `fetch`. The backend URL is baked into the bundle at build time from
`PUBLIC_API_URL` via `$env/static/public`. There is no runtime environment resolution
on the frontend — rebuilding is required to change the backend URL.

## Backend

Hono, a small TypeScript HTTP framework that runs anywhere `fetch` exists: Node,
Workers, Lambda, Bun, Deno. One app definition (`src/app.ts`) is shared by two
entry points:

- `src/server.ts` uses `@hono/node-server` to run it as a real HTTP server on port
  3001 for local development. `tsx watch` reloads on change.
- `src/lambda.ts` wraps the same app with `hono/aws-lambda` and exports a
  `handler` function that AWS Lambda invokes for each request.

Handler code, routing, and middleware are identical across both — the only
difference is how requests reach the app.

### Routes

- `GET /health` — liveness check, returns `{ ok: true }`
- `POST /orders` — accepts an order JSON body, validates it, generates a reference
  `MG-YYMMDD-XXXX`, sends two emails via Resend (owner + customer), returns
  `{ success: true, ref }` or `{ error }` with an appropriate status code

### CORS

`ALLOWED_ORIGINS` is a comma-separated env var checked by `hono/cors` middleware.
The browser is only permitted to call the backend from origins in that list. In
local development it is `http://localhost:7777`; in production it is the
CloudFront domain.

### Email

Resend is called directly via `fetch` — no SDK dependency. The wrapper lives in
`src/email.ts`. Two templates are defined inline in `routes/orders.ts`: one for
the shop owner (order details) and one for the customer (EFT banking details and
reference number).

## Order flow

```
Browser (shop.html + JS)
    │
    │ POST /orders  { name, email, address, items, ... }
    ▼
Backend Hono app
    │
    │ validate → generate ref → send emails
    ▼
Resend API
    │
    ├──▶ owner@example.com    (new order notification)
    └──▶ customer              (confirmation + banking details + reference)
```

The backend holds no database. Orders exist only as emails and whatever inbox the
owner reads them in. Payment is out-of-band via EFT; reconciliation is manual.

## Deployment targets

- **Frontend**: S3 bucket (private, no public ACL) + CloudFront distribution with
  Origin Access Control. ACM certificate for the custom domain. Route 53 alias.
- **Backend**: AWS Lambda. Simplest wiring is a Function URL (no API Gateway). The
  Lambda handler is `backend/dist/lambda.handler` after `pnpm backend build`.

Infrastructure as Code is deliberately not set up yet. When it is, AWS CDK is the
recommended tool: one stack, ~60 lines covers bucket, distribution, Lambda,
function URL, and DNS.

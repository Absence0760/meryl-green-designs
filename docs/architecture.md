# Architecture

## Overview

Meryl Green Designs is a static brochure site with a small serverless backend for
handling order submissions and a headless CMS for managing shop content. It is a
pnpm workspace with three packages:

- `frontend/` — SvelteKit (Svelte 5), built with `@sveltejs/adapter-static`. Ships as
  pre-rendered HTML + assets. Fetches product data from Sanity at build time.
- `backend/` — Hono app, written once and deployed two ways: as a local Node HTTP
  server for development and as an AWS Lambda handler for production.
- `studio/` — Sanity Studio v3, a dashboard where the shop owner manages products
  (name, price, photos, availability). Runs locally or as a free hosted app at
  `*.sanity.studio`.

The three are decoupled. The frontend knows the backend only by its URL
(`PUBLIC_API_URL`), and knows Sanity only by a project ID (`PUBLIC_SANITY_PROJECT_ID`).
The backend has no knowledge of Sanity or the frontend — it just receives order
submissions and sends emails.

## Repo layout

```
meryl-green-designs/
├── package.json              Workspace root scripts (dev/build/check)
├── pnpm-workspace.yaml       Lists frontend, backend, studio as packages
├── docs/                     This documentation
├── frontend/
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── .env.example          PUBLIC_API_URL, PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET
│   └── src/
│       ├── app.css           Base styles + theme tokens
│       ├── app.html
│       ├── lib/
│       │   ├── sanity.ts            Sanity client factory + Product type + helpers
│       │   └── queries.ts           GROQ queries (loadProducts etc.)
│       └── routes/
│           ├── +layout.svelte       Header, nav, under-construction banner, footer
│           ├── +layout.ts           export const prerender = true
│           ├── +page.svelte         Home: hero / story / poem
│           ├── gallery/+page.svelte
│           ├── shop/
│           │   ├── +page.ts         Loader — fetches products from Sanity
│           │   └── +page.svelte     Product grid + order form + EFT details
│           └── contact/+page.svelte
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example          RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL, ALLOWED_ORIGINS
│   └── src/
│       ├── app.ts            Hono app factory + CORS + route mounting
│       ├── server.ts         Local dev entry (runs on :3001)
│       ├── lambda.ts         AWS Lambda entry (wraps app with hono/aws-lambda)
│       ├── email.ts          Resend API wrapper + HTML escaping
│       └── routes/
│           └── orders.ts     POST /orders — validate + send emails
└── studio/
    ├── package.json
    ├── sanity.config.ts      Studio configuration (project, plugins, schema)
    ├── sanity.cli.ts         CLI configuration (used by `sanity deploy`, etc.)
    ├── .env.example          SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET
    └── schemas/
        ├── index.ts          Schema registry
        └── product.ts        Product schema (name, price, photos, availability, order)
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

Product data is loaded from Sanity at build time by `frontend/src/routes/shop/+page.ts`.
The loader runs during prerendering, the query result is baked into `shop.html`, and
the shop renders a static list of products. When Meryl edits a product in the Studio,
the site must be rebuilt to reflect the change — a Sanity webhook triggering a CI
redeploy is the intended production setup.

If `PUBLIC_SANITY_PROJECT_ID` is empty (e.g. before a Sanity project has been created),
the loader returns an empty list and the shop page shows a friendly empty state. The
build still succeeds.

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

## Studio

Sanity Studio v3, configured in `studio/sanity.config.ts`. It is a standalone React
application, not part of the SvelteKit app. It runs in one of three places:

- **Locally** via `pnpm studio dev` on `http://localhost:3333`. Used during
  schema development and content authoring before the studio is published.
- **Hosted by Sanity** via `pnpm studio deploy`. Produces a free
  `https://<name>.sanity.studio` URL that the shop owner logs into from anywhere.
- **Self-hosted** (optional) by bundling with `pnpm studio build` and uploading
  `studio/dist` to any static host. Not the recommended path — the hosted studio
  is free and requires no ops.

Schemas are defined in `studio/schemas/`. Adding a new schema means creating a
file, registering it in `schemas/index.ts`, and updating the frontend queries in
`frontend/src/lib/queries.ts` to fetch it. There is currently one schema:
`product`.

The studio reads `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` from its
own `.env`. The frontend reads the *same* project via `PUBLIC_SANITY_PROJECT_ID`
and `PUBLIC_SANITY_DATASET` in its `.env`. Both sides must point to the same
project for content to flow through.

## Content flow (products)

```
Meryl (browser)
    │ edits products in Sanity Studio
    ▼
Sanity (hosted content dataset)
    │
    │ on publish: webhook → CI
    ▼
GitHub Actions / deploy pipeline
    │ pnpm frontend build   (loader fetches products)
    ▼
S3 bucket (new shop.html baked with latest products)
    │
    ▼
CloudFront (invalidation)
    │
    ▼
Visitor sees updated shop
```

The webhook → rebuild step is not yet wired (the deploy pipeline itself is a
roadmap item). Until it is, rebuilds are triggered manually.

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
- **Studio**: hosted by Sanity at `https://merylgreendesigns.sanity.studio` (or
  similar) via `pnpm studio deploy`. No AWS resources involved.

Infrastructure as Code is deliberately not set up yet. When it is, AWS CDK is the
recommended tool: one stack, ~60 lines covers bucket, distribution, Lambda,
function URL, and DNS. The Sanity Studio deployment is separate and handled by
the Sanity CLI.

# Architecture

## Overview

Meryl Green Designs is a static brochure site with a small serverless backend for
handling order submissions and a headless CMS for managing shop content. It is a
pnpm workspace with three packages, plus a Terraform module for infrastructure
and GitHub Actions workflows for CI/CD:

- `frontend/` — SvelteKit (Svelte 5), built with `@sveltejs/adapter-static`. Ships as
  pre-rendered HTML + assets. Fetches product data from Sanity at build time.
- `backend/` — Hono app, written once and deployed two ways: as a local Node HTTP
  server for development and as an AWS Lambda handler for production. Bundled
  with esbuild.
- `studio/` — Sanity Studio v3, a dashboard where the shop owner manages products
  (name, price, photos, availability). Runs locally or as a free hosted app at
  `*.sanity.studio`.
- `infra/` — Terraform module that provisions all AWS resources (S3, CloudFront,
  Lambda, IAM, Route 53, ACM, GitHub OIDC). Not a workspace package.
- `.github/workflows/` — three deploy workflows (frontend, backend, studio) that
  authenticate to AWS via OIDC and deploy on push to `main`.

The three app packages are decoupled. The frontend knows the backend only by its
URL (`PUBLIC_API_URL`), and knows Sanity only by a project ID
(`PUBLIC_SANITY_PROJECT_ID`). The backend has no knowledge of Sanity or the
frontend — it just receives order submissions and sends emails.

## Repo layout

```
meryl-green-designs/
├── README.md                 Project overview + quick start
├── package.json              Workspace root scripts (dev/build/check)
├── pnpm-workspace.yaml       Lists frontend, backend, studio as packages
├── docs/                     Architecture, features, roadmap, run-locally, deployment
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
│   ├── package.json          Build script runs esbuild → dist/lambda.mjs
│   ├── tsconfig.json
│   ├── .env.example          RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL, ALLOWED_ORIGINS
│   └── src/
│       ├── app.ts            Hono app factory + CORS + route mounting
│       ├── server.ts         Local dev entry (runs on :3001)
│       ├── lambda.ts         AWS Lambda entry (wraps app with hono/aws-lambda)
│       ├── email.ts          Resend API wrapper + HTML escaping
│       └── routes/
│           └── orders.ts     POST /orders — validate + send emails
├── studio/
│   ├── package.json
│   ├── sanity.config.ts      Studio configuration (project, plugins, schema)
│   ├── sanity.cli.ts         CLI configuration (used by `sanity deploy`, etc.)
│   ├── .env.example          SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET
│   └── schemas/
│       ├── index.ts          Schema registry
│       └── product.ts        Product schema (name, price, photos, availability, order)
├── infra/
│   ├── README.md             Bootstrap + apply walkthrough
│   ├── main.tf               Providers (af-south-1 + us-east-1 alias), state backend
│   ├── variables.tf
│   ├── outputs.tf            Values CI reads (bucket, distribution id, role ARN, etc.)
│   ├── s3_cloudfront.tf      Bucket + OAC + cert + CloudFront + Route 53 records
│   ├── lambda.tf             Function + exec role + log group + Function URL
│   ├── github_oidc.tf        GitHub OIDC provider + CI role + scoped policy
│   └── terraform.tfvars.example
└── .github/
    └── workflows/
        ├── deploy-frontend.yml   Build + sync to S3 + CloudFront invalidation
        ├── deploy-backend.yml    esbuild bundle + zip + update Lambda
        ├── deploy-studio.yml     `sanity deploy` with auth token
        └── claude.yml            (Claude Code issue/PR automation)
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

The deploy pipeline exists (`.github/workflows/deploy-frontend.yml`) and accepts
`repository_dispatch` events. What remains is a one-time setup: apply the
Terraform, populate the GitHub environment variables with the outputs, and
configure a Sanity webhook that POSTs to the GitHub Actions dispatch endpoint
with `event_type: sanity-publish`. Step-by-step instructions are in
[`deployment.md`](./deployment.md) section 9.

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

- **Frontend**: S3 bucket (private, blocked public access) + CloudFront
  distribution with Origin Access Control. ACM certificate in `us-east-1`
  (CloudFront requirement). Route 53 A-alias records for apex and `www`.
- **Backend**: AWS Lambda with a Function URL (no API Gateway). Bundled to a
  single `dist/lambda.mjs` file via esbuild, zipped, uploaded by CI. IAM
  execution role with CloudWatch Logs permission. 30-day log retention.
- **Studio**: hosted by Sanity at `https://<name>.sanity.studio` via
  `pnpm studio deploy`. No AWS resources involved.

Infrastructure is defined in Terraform at `infra/`. One apply creates all AWS
resources above plus the GitHub OIDC provider and CI role. State is stored in
an S3 bucket with a DynamoDB lock table (created manually once; see
`infra/README.md` for the bootstrap commands). The primary region is
`af-south-1` (Cape Town); the ACM cert provider alias targets `us-east-1`.

CI/CD lives in `.github/workflows/`:
- `deploy-frontend.yml` — path-filtered on `frontend/**`; also triggered by
  `repository_dispatch` events from the Sanity webhook (for content changes)
- `deploy-backend.yml` — path-filtered on `backend/**`; typechecks, bundles
  with esbuild, zips, updates the Lambda via `aws lambda update-function-code`
- `deploy-studio.yml` — path-filtered on `studio/**`; runs `sanity deploy`

All three workflows authenticate to AWS via **GitHub OIDC federation** — no
long-lived access keys are stored in the repo. The IAM role's trust policy
is scoped to the `main` branch of the repo only.

Full walkthrough of first-time deployment: see
[`deployment.md`](./deployment.md).

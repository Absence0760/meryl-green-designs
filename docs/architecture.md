# Architecture

## Overview

Meryl Green Designs is a static brochure site with a small serverless backend for
handling order submissions and a headless CMS for managing shop content. It is a
pnpm workspace with three packages, plus a Terraform module for infrastructure
and GitHub Actions workflows for CI/CD:

- `frontend/` — SvelteKit (Svelte 5), built with `@sveltejs/adapter-static`. Ships as
  pre-rendered HTML + assets. Shop and gallery prerender as static shells with
  skeleton loading states, then fetch product/gallery data from the backend at
  runtime via client-side `onMount`.
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
│       │   └── sanity.ts            Product type, image URL builder, price formatter
│       └── routes/
│           ├── +layout.svelte       Header, nav, footer
│           ├── +layout.ts           export const prerender = true
│           ├── +page.svelte         Home: hero / story / poem
│           ├── gallery/
│           │   ├── +page.ts         export const prerender = true (SSR'd shell with skeletons)
│           │   └── +page.svelte     Photo grid + skeleton loader + empty state (client-side fetch)
│           ├── shop/
│           │   ├── +page.ts         export const prerender = true (SSR'd shell with skeletons)
│           │   └── +page.svelte     Product grid + order form + EFT details (client-side fetch)
│           ├── track/
│           │   ├── +page.ts         prerender=true, ssr=false (client-only)
│           │   └── +page.svelte     Order lookup form + status card
│           └── contact/+page.svelte
├── backend/
│   ├── package.json          Build script runs esbuild → dist/lambda.mjs
│   ├── tsconfig.json
│   ├── .env.example          Resend + Sanity + webhook secret env vars
│   └── src/
│       ├── app.ts            Hono app factory + CORS + route mounting
│       ├── server.ts         Local dev entry (runs on :3001)
│       ├── lambda.ts         AWS Lambda entry (wraps app with hono/aws-lambda)
│       ├── email.ts          Resend API wrapper + HTML escaping
│       ├── email-templates.ts Status-keyed customer email templates
│       ├── sanity.ts         @sanity/client wrapper: createOrder, getOrderByRef, getProducts, getGalleryPhotos
│       └── routes/
│           ├── products.ts         GET /products — list available products from Sanity
│           ├── gallery.ts          GET /gallery — list visible gallery photos from Sanity
│           ├── orders.ts           POST /orders — validate + create Sanity doc + send emails
│           ├── order-lookup.ts     GET /orders/:ref?email= — track page lookup
│           └── sanity-webhook.ts   POST /webhooks/sanity-order — verify sig + dispatch email
├── studio/
│   ├── package.json
│   ├── sanity.config.ts      Studio configuration (project, plugins, schema)
│   ├── sanity.cli.ts         CLI configuration (used by `sanity deploy`, etc.)
│   ├── .env.example          SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET
│   └── schemas/
│       ├── index.ts          Schema registry
│       ├── product.ts        Product schema (name, price, photos, availability, order)
│       ├── galleryPhoto.ts   Gallery photo schema (image, caption, visible, order)
│       └── order.ts          Order schema (ref, status, customer, shipping, internal notes)
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

Product and gallery data are fetched at **runtime** by the browser, not at
build time. Each route prerenders a static HTML shell containing the layout
chrome, heading, lede, and a skeleton loading state. On hydration, the
component's `onMount` fires and makes a client-side `fetch` to
`${PUBLIC_API_URL}/products` or `/gallery`. The backend reads from Sanity
using its API token and returns the data as JSON. The skeleton swaps for
real content, then `loading="lazy"` images download progressively as the
user scrolls.

This pattern has three deliberate properties:

1. **First paint is instant** — the shell comes from CloudFront/S3 in
   ~100 ms globally; visitors see layout, heading, and skeletons before
   any data or images are requested
2. **Content is live** — because the fetch runs on every visit, a product
   edit in Sanity Studio is visible within seconds without a frontend
   rebuild (the "rebuild on publish" webhook still exists but is only
   strictly needed for content that's baked at build time, which for now
   is nothing)
3. **The site stays fully static** — no server, no SSR at runtime, no
   Node process on the hot path. S3 + CloudFront serves everything; the
   Lambda is only invoked when a browser makes an `/orders`, `/products`,
   `/gallery`, or `/webhooks/sanity-order` call

If the backend is unreachable when the client tries to fetch, the component
shows an error state and the skeleton clears. Empty responses (no products
yet) show a friendly "no products listed yet" empty state instead.

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
- `GET /products` — returns the list of published + available products from
  Sanity. Called by the frontend's shop page at runtime (client-side `fetch`
  in `onMount`). This endpoint exists so the Sanity dataset can stay private
  while the product catalogue is still visible on the public site.
- `GET /gallery` — returns the list of visible gallery photos from Sanity,
  ordered by the `order` field. Called by the frontend's gallery page at
  runtime, same pattern as `/products`.
- `POST /orders` — accepts an order JSON body, validates it, generates a reference
  `MG-YYMMDD-XXXX`, **creates a Sanity `order` document via an authenticated
  client**, sends two emails via Resend (owner + customer confirmation with a
  tracking link), returns `{ success: true, ref }` or `{ error }`
- `GET /orders/:ref?email=…` — customer-facing order lookup. Queries Sanity
  by `orderRef`, verifies the provided email matches the stored email, and
  returns a sanitised subset (no internal notes, no phone, no shipping
  address). 404 on both missing ref and email mismatch to prevent
  enumeration.
- `POST /webhooks/sanity-order` — receives webhook POSTs from Sanity when an
  order's `status` field changes. Verifies the HMAC-SHA256 signature on the
  **raw** request body (before JSON parsing) against
  `SANITY_WEBHOOK_SECRET`, then dispatches the appropriate status-change
  email to the customer via Resend.

### CORS

`ALLOWED_ORIGINS` is a comma-separated env var checked by `hono/cors` middleware.
The browser is only permitted to call the backend from origins in that list. In
local development it is `http://localhost:7777`; in production it is the
CloudFront domain.

### Email

Resend is called directly via `fetch` — no SDK dependency. The wrapper lives
in `src/email.ts`. Templates are extracted into `src/email-templates.ts`,
keyed by order status:

- `ownerNotification()` — sent to Meryl on every new order
- `pending_payment` — customer confirmation with EFT banking details
- `payment_received` — "we got your payment, shipping soon"
- `shipped` — "on the way", including tracking info if present
- `delivered` — optional "hope you love it"
- `cancelled` — "your order was cancelled"

Each customer email includes a tracking link deep-linked with the customer's
ref and email (`/track?ref=…&email=…`) so they can bookmark or revisit at any
time.

### Sanity client

`src/sanity.ts` wraps `@sanity/client` and exposes `createOrder()`,
`getOrderByRef()`, `getProducts()`, and `getGalleryPhotos()`. Uses
`SANITY_API_TOKEN` for authentication — writes and reads both require the
token, because the dataset is configured as private in the Sanity dashboard.
The frontend never talks to Sanity's query API directly; it only builds
image URLs from the public asset CDN using the project ID baked into its
bundle.

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
file, registering it in `schemas/index.ts`, and (usually) adding a backend
route that fetches it via the authenticated Sanity client. Three schemas
currently exist: `product`, `galleryPhoto`, and `order`.

The studio reads `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` from its
own `.env`. The frontend reads the *same* project via `PUBLIC_SANITY_PROJECT_ID`
and `PUBLIC_SANITY_DATASET` in its `.env`. Both sides must point to the same
project for content to flow through.

## Content flow (products + gallery)

Products and gallery photos are fetched at **runtime** by the visitor's
browser, not baked into the static build. Meryl's edits appear on the live
site within seconds — no rebuild, no webhook, no CI round-trip.

```
Meryl edits in Sanity Studio                      Visitor on the site
          │                                               │
          │ clicks Publish                                │ opens /shop or /gallery
          ▼                                               ▼
     Sanity dataset                                CloudFront → S3
     (updated instantly)                                   │
          │                                               │ static HTML shell (skeleton)
          │                                               ▼
          │                                          Browser hydrates
          │                                               │
          │                                               │ GET /products or /gallery
          │                                               ▼
          │                                          Lambda (backend)
          │                                               │
          ▼                                               │ queries Sanity with token
     Sanity CDN  ◄──────────────────────────────────────┘
          │
          │ returns latest products/photos
          ▼
     Skeleton swaps for real content
     Images lazy-load from Sanity's asset CDN
```

The `deploy-frontend.yml` workflow also accepts `repository_dispatch` events
from a content-rebuild webhook, which is useful for content baked at build
time. With products and gallery fetched at runtime, this webhook isn't
strictly required today, but it's ready to wire up if home page story/poem
ever move into Sanity (they're currently hardcoded). Setup instructions are
in [`deployment.md`](./deployment.md) section 9.

## Order creation flow

```
Browser (shop.html + JS)
    │
    │ POST /orders  { name, email, address, items, ... }
    ▼
Backend Hono app
    │
    │ validate → generate ref
    ▼
Sanity (create order document, status: pending_payment)
    │
    ▼
Resend API
    │
    ├──▶ owner@example.com    (new order notification)
    └──▶ customer              (confirmation + banking + tracking link)
```

## Order status-update flow

```
Meryl in Sanity Studio
    │ changes status field, clicks Publish
    ▼
Sanity (filter: _type == "order" && delta::changedAny(status))
    │ fires webhook → POST /webhooks/sanity-order
    ▼
Backend Hono app
    │ verify HMAC-SHA256 over raw body
    │ look up email template for new status
    ▼
Resend API
    │
    └──▶ customer              (payment received / shipped / delivered / cancelled)
```

## Order tracking flow

```
Customer clicks tracking link in email (or visits /track directly)
    │
    ▼
/track page hydrates (prerendered shell + client-only component)
    │ GET /orders/:ref?email=…
    ▼
Backend
    │ query Sanity by orderRef, verify email matches, sanitise fields
    ▼
Customer sees status, progress indicator, tracking info (if shipped)
```

Orders live as structured documents in Sanity. Meryl manages their lifecycle
in Studio; the backend creates documents, reads documents for lookups, and
receives status-change webhooks. Customer PII is stored on the order
document and must not live on a public Sanity dataset in production — see
`orders-and-tracking.md` for the fix before launch. Payment is still
out-of-band via EFT; reconciliation (matching bank deposits to orders) is
still manual on Meryl's side.

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

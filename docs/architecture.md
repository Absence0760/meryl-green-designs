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
  Lambda, API Gateway HTTP API, IAM, Route 53, ACM, GitHub OIDC). Not a workspace package.
- `.github/workflows/` — three deploy workflows (frontend, backend, studio)
  that authenticate to AWS via OIDC and run when a GitHub release is published
  (release-gated, with skip-if-unchanged checks per workspace).

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
│       │   ├── sanity.ts            Product / GalleryPhoto / Testimonial types, image URL builder, price formatter
│       │   ├── Button.svelte        Shared button (4 variants × 2 sizes), renders <button> or <a>
│       │   ├── Cart.svelte          Slide-out cart panel: line items, quantity controls, checkout form
│       │   ├── cartStore.svelte.ts  Thin rune wrapper exposing the shared cart store ($state)
│       │   └── cartLogic.ts         Pure cart mutations (add / remove / increment / decrement / total) — testable
│       └── routes/
│           ├── +layout.svelte       Header, nav, footer
│           ├── +layout.ts           export const prerender = true
│           ├── +page.svelte         Home: hero / story / poem
│           ├── gallery/
│           │   ├── +page.ts         export const prerender = true (SSR'd shell with skeletons)
│           │   └── +page.svelte     Photo grid + skeleton loader + empty state (client-side fetch)
│           ├── shop/
│           │   ├── +page.ts         export const prerender = true (SSR'd shell with skeletons)
│           │   ├── +page.svelte     Product grid + order form + payment + per-tile hover reveal
│           │   └── [slug]/
│           │       ├── +page.ts     prerender=false, ssr=false (SPA fallback)
│           │       └── +page.svelte Product detail page: gallery + info + add-to-cart
│           ├── payment/
│           │   ├── complete/        PayFast return page after successful payment
│           │   └── cancelled/       PayFast return page after cancelled payment
│           ├── track/
│           │   ├── +page.ts         prerender=true, ssr=false (client-only)
│           │   └── +page.svelte     Order lookup form + status card
│           ├── privacy/+page.svelte  POPIA-first privacy policy
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
│       ├── payfast.ts        PayFast signature generation, ITN validation, form-data builder
│       ├── sanity.ts         @sanity/client wrapper: createOrder, getOrderByRef, getProducts, etc.
│       └── routes/
│           ├── products.ts         GET /products + GET /products/:slug from Sanity
│           ├── gallery.ts          GET /gallery — list visible gallery photos from Sanity
│           ├── testimonials.ts     GET /testimonials — list visible testimonials from Sanity
│           ├── orders.ts           POST /orders — validate + create Sanity doc + PayFast/email
│           ├── order-lookup.ts     GET /orders/:ref?email= — track page lookup
│           ├── enquiries.ts        POST /enquiries — commission enquiry form → owner email
│           ├── payfast-itn.ts      POST /webhooks/payfast-itn — PayFast payment confirmation
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
│       ├── testimonial.ts    Testimonial schema (quote, author, location, visible, order)
│       └── order.ts          Order schema (ref, status, customer, shipping, internal notes)
├── infra/
│   ├── README.md             Bootstrap + apply walkthrough
│   ├── main.tf               Providers (af-south-1 + us-east-1 alias), state backend
│   ├── variables.tf
│   ├── outputs.tf            Values CI reads (bucket, distribution id, role ARN, etc.)
│   ├── s3_cloudfront.tf      Bucket + OAC + cert + CloudFront (incl. /api/* → API Gateway behavior) + Route 53 records
│   ├── lambda.tf             Function + exec role + log group
│   ├── api_gateway.tf        HTTP API + AWS_PROXY integration + default stage + invoke permission
│   ├── github_oidc.tf        GitHub OIDC provider + CI role (trust-policied to `production` env) + scoped policy
│   └── terraform.tfvars.example
└── .github/
    └── workflows/
        ├── deploy-frontend.yml   Build + sync to S3 + CloudFront invalidation
        ├── deploy-backend.yml    esbuild bundle + zip + update Lambda
        ├── deploy-studio.yml     `sanity deploy` with auth token
        └── claude.yml            (Claude Code issue/PR automation)
```

## Frontend

SvelteKit with `adapter-static`. Most routes have `prerender = true` (set in
`+layout.ts`), so the build emits one real `.html` file per route:

```
build/
├── _app/           JS chunks, CSS, fonts
├── index.html
├── gallery.html
├── shop.html
├── contact.html
├── privacy.html
└── 404.html        SPA fallback — see below
```

This is the directory that uploads to S3. CloudFront sits in front for caching and
TLS termination. No server-side rendering, no runtime, no Node process.

**SPA fallback for dynamic routes.** The product detail route `/shop/[slug]`
can't be enumerated at build time (slugs come from Sanity), so its
`+page.ts` sets `prerender = false; ssr = false;` and the static adapter
is configured with `fallback: '404.html'`. The emitted `404.html` is an
SPA shell that boots, reads the URL, and renders the matching product
page. CloudFront's `custom_error_response` in `infra/s3_cloudfront.tf`
rewrites 404 and 403 responses to `/404.html` with HTTP 200, so direct
visits to dynamic routes resolve correctly without leaking a 4xx status.

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
   Lambda is only invoked when a browser hits `/orders`, `/products`,
   `/products/:slug`, `/gallery`, or `/testimonials`, or when Sanity or
   PayFast posts to a `/webhooks/*` endpoint

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
- `GET /products/:slug` — returns a single published, available product by
  slug. Called by the frontend's `/shop/[slug]` detail page at runtime.
  Returns 404 when no matching product exists, which the page renders as
  a "product not found" state.
- `GET /gallery` — returns the list of visible gallery photos from Sanity,
  ordered by the `order` field. Called by the frontend's gallery page and
  the home page's featured-photographs band at runtime.
- `GET /testimonials` — returns the list of visible testimonials from
  Sanity, ordered by the `order` field. Called by the home page at
  runtime; the testimonials section silently no-ops if the response is
  empty or the fetch fails.
- `POST /orders` — accepts an order JSON body with a `cart` array, validates
  it, looks up product prices in Sanity, generates a reference `MG-YYMMDD-XXXXXX`,
  **creates a Sanity `order` document**, sends the owner notification email,
  and returns signed PayFast form data for redirect:
  `{ success, ref, payfast: { action, fields } }`
- `GET /orders/:ref?email=…` — customer-facing order lookup. Queries Sanity
  by `orderRef`, verifies the provided email matches the stored email, and
  returns a sanitised subset (no internal notes, no phone, no shipping
  address). 404 on both missing ref and email mismatch to prevent
  enumeration.
- `POST /enquiries` — commission enquiry form on `/contact`. Validates
  the body (required name/email/message + length limits, honeypot, valid
  email regex), then sends a single notification email to `OWNER_EMAIL`
  via Resend with `replyTo` set to the visitor's claimed email and a
  prominent unverified-sender warning rendered in the email body. No
  Sanity document is created — at the current scale, treating enquiries
  as a transient email is simpler than another data store.
- `POST /webhooks/sanity-order` — receives webhook POSTs from Sanity when an
  order's `status` field changes. Verifies the HMAC-SHA256 signature on the
  **raw** request body (before JSON parsing) against
  `SANITY_WEBHOOK_SECRET`, then dispatches the appropriate status-change
  email to the customer via Resend.
- `POST /webhooks/payfast-itn` — receives PayFast Instant Transaction
  Notifications after a customer pays. Validates the MD5 signature and
  confirms the amount matches the stored order. On a valid COMPLETE
  payment, updates the Sanity order status to `payment_received` — which
  triggers the Sanity webhook above and sends the customer their
  confirmation email.

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
- `pending_payment` — fallback "we've received your order, awaiting payment"
  (the normal PayFast flow redirects straight to checkout, so this template
  only fires if Meryl manually resets an order's status)
- `payment_received` — "we got your payment, shipping soon"
- `shipped` — "on the way", including tracking info if present
- `delivered` — optional "hope you love it"
- `cancelled` — "your order was cancelled"

Each customer email includes a tracking link deep-linked with the customer's
ref and email (`/track?ref=…&email=…`) so they can bookmark or revisit at any
time.

### Sanity client

`src/sanity.ts` wraps `@sanity/client` and exposes `createOrder()`,
`updateOrderPayment()`, `getOrderByRef()`, `getProducts()`,
`getProductBySlug()`, `getProductsByIds()`, `getGalleryPhotos()`, and
`getTestimonials()`. Uses `SANITY_API_TOKEN` for authentication — writes
and reads both require the token, because the dataset is configured as
private in the Sanity dashboard.
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
route that fetches it via the authenticated Sanity client. Four schemas
currently exist: `product`, `galleryPhoto`, `testimonial`, and `order`.

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

### PayFast payment flow

```
Browser (shop.html + JS)
    │
    │ POST /orders  { paymentMethod: 'payfast', cart: [...], ... }
    ▼
Backend Hono app
    │
    │ validate → look up product prices in Sanity → compute total
    │ generate ref → create Sanity order (pending_payment, paymentMethod: payfast)
    │ send owner notification email
    │ generate signed PayFast form data
    ▼
Returns { success, ref, payfast: { action, fields } }
    │
    ▼
Browser auto-submits hidden form → customer lands on PayFast
    │
    ▼
Customer pays on PayFast's hosted page
    │
    ├──▶ Redirect → /payment/complete?ref=…
    │
    └──▶ ITN (server-to-server POST) → /webhooks/payfast-itn
              │
              │ validate signature + amount
              ▼
         Update Sanity order: status → payment_received
              │
              ▼
         Existing Sanity webhook fires → "payment received" email
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
`orders-and-tracking.md` for the fix before launch. Payment is via PayFast
(card, Apple Pay, etc.) with automatic confirmation via ITN.

## Deployment targets

- **Frontend**: S3 bucket (private, blocked public access) + CloudFront
  distribution with Origin Access Control. ACM certificate in `us-east-1`
  (CloudFront requirement). Route 53 A-alias records for apex and `www`.
- **Backend**: AWS Lambda fronted by API Gateway v2 (HTTP API), with
  CloudFront routing `/api/*` to API Gateway via a second origin. A
  CloudFront Function strips the `/api` prefix before forwarding, so Hono
  routes stay at `/orders`, `/products`, etc. The Lambda code is bundled to
  a single `dist/lambda.mjs` via esbuild, zipped, uploaded by CI. IAM
  execution role with CloudWatch Logs permission. 30-day log retention.
  Historical note: the backend originally used a Lambda Function URL, but
  that feature hit an undiagnosable AWS-side 403 in this account + region
  for every invocation (public or IAM-signed via CloudFront OAC). API
  Gateway uses a different gateway pipeline and works correctly.
- **Studio**: hosted by Sanity at `https://<name>.sanity.studio` via
  `pnpm studio deploy`. No AWS resources involved.

Infrastructure is defined in Terraform at `infra/`. One apply creates all AWS
resources above plus the GitHub OIDC provider and CI role. State is stored in
an S3 bucket with a DynamoDB lock table (created manually once; see
`infra/README.md` for the bootstrap commands). The primary region is
`af-south-1` (Cape Town); the ACM cert provider alias targets `us-east-1`.

CI/CD lives in `.github/workflows/`:
- `ci.yml` — typecheck + vitest on every PR and push. Never deploys.
- `deploy-frontend.yml` — runs on `release: published`. Check job diffs the
  release tag against the previous release, scoped to `frontend/**` + shared
  files; deploys only if anything relevant changed. Also responds to
  `repository_dispatch: sanity-publish` events from the Sanity content-rebuild
  webhook (always deploys in that case).
- `deploy-backend.yml` — runs on `release: published`, same skip-if-unchanged
  logic scoped to `backend/**`. Typechecks, bundles with esbuild, zips,
  updates the Lambda via `aws lambda update-function-code`.
- `deploy-studio.yml` — runs on `release: published`, same skip-if-unchanged
  logic scoped to `studio/**`. Runs `sanity deploy`.
- `dependabot-lockfile.yml` — runs on Dependabot PRs that touch any
  `package.json`. Regenerates the root `pnpm-lock.yaml` with
  `pnpm install --lockfile-only` and commits it back, because Dependabot
  itself only rewrites per-workspace `package.json` and leaves the shared
  root lockfile stale (which otherwise breaks `ci.yml`'s `--frozen-lockfile`).
  Requires a `DEPENDABOT_LOCKFILE_PAT` repo secret — see the workflow file.

All three deploy workflows authenticate to AWS via **GitHub OIDC federation** — no
long-lived access keys are stored in the repo. The IAM role's trust policy
is scoped to the `production` GitHub Actions environment of the repo (not
the `main` branch, because release-triggered workflows run with
`github.ref = refs/tags/<tag>`, which a branch-scoped trust policy would
reject).

Full walkthrough of first-time deployment: see
[`deployment.md`](./deployment.md).

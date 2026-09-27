# Running locally

This guide gets the frontend, backend, and (optionally) the Sanity Studio
running on your machine. **A fresh clone runs with no secrets, no cloud
accounts and no env-file copying** — the defaults are committed.

For deploying to AWS, see [`deployment.md`](./deployment.md) instead.

## Prerequisites

- **Node.js 22 or later** — check with `node --version`
- **pnpm 9 or later** — check with `pnpm --version`. Install via Corepack
  (`corepack enable && corepack prepare pnpm@latest --activate`) rather
  than `npm install -g pnpm`, so the version is pinned per Node install
  and you don't need a root npm global directory.
- **Docker + Docker Compose** — *optional*, only to place orders locally.
  Order PII goes to a DynamoDB table, served locally by a LocalStack
  container on `:4566` (never the prod table). Browsing the shop, gallery
  and contact pages works without it. See
  [Setting up local DynamoDB](#setting-up-local-dynamodb).

Not needed for local dev: an AWS account, the private `infra-secrets` repo,
a Sanity project, a Resend account, or PayFast credentials.

## Quick start

From the repository root:

```bash
pnpm install        # all workspaces, one hoisted node_modules
pnpm dev:db:up      # optional — LocalStack for checkout / order tracking (needs Docker)
pnpm dev            # frontend :7777 + backend :3001
```

Open [http://localhost:7777](http://localhost:7777). The shop, gallery and
testimonials show the committed **sample content**, and checkout redirects to
PayFast's public sandbox. That's it.

### What the committed defaults do

Each workspace has a committed `.env.development` that the dev tooling loads
automatically (`backend/src/load-dev-env.ts` for the backend; Vite/SvelteKit
and the Sanity CLI natively in development mode):

| Workspace | Default | Effect |
|---|---|---|
| backend | `CONTENT_BACKEND=local` | Products, gallery and testimonials come from `backend/dev-content.sample/` (or your own `backend/.dev-content/`); order skeletons go to `backend/.dev-content/orders.json`. No Sanity. See [Local content preview](#local-content-preview-no-sanity). |
| backend | `EMAIL_BACKEND=file` | Emails are written to `backend/.dev-emails/`; `pnpm dev:emails` opens the newest. No Resend. See [Local email capture](#local-email-capture). |
| backend | `DYNAMODB_ENDPOINT=http://localhost:4566` | Order PII goes to LocalStack, never real AWS. |
| backend | `PAYFAST_*` = public sandbox merchant `10004002` | Checkout signs forms for `sandbox.payfast.co.za`. No real money. |
| backend + studio | `ADMIN_API_TOKEN` / `SANITY_STUDIO_ADMIN_TOKEN` = `local-dev-admin-token` | Studio PII panels ↔ backend `/admin/*` work locally. |
| frontend | `PUBLIC_API_URL=http://localhost:3001` | Browser talks to the local backend. |

The committed files hold **non-sensitive values only** — this repo is public,
and `backend/src/__tests__/env-development.test.ts` fails if a
secret-looking value lands in one. None of them can reach production:

- the Lambda never loads dotenv (its env comes only from Terraform), and
  `createApp()` refuses to start on Lambda if `CONTENT_BACKEND=local`,
  `EMAIL_BACKEND=file` or the dev admin token is set (`backend/src/runtime-guard.ts`);
- `vite build` and `sanity build` / `sanity deploy` run in *production* mode,
  which doesn't read `.env.development`; the deploy workflows supply the real
  values, and a frontend production build with no `PUBLIC_*` env fails with a
  clear message (`frontend/vite.config.ts`). For a local production-style
  build with the dev defaults, use `pnpm frontend build --mode development`.

### Overriding values on your machine

Put personal overrides and any real secrets in a gitignored
`<workspace>/.env.development.local`. It is loaded with higher priority than
the committed file, key by key, so it only needs the keys you change:

```ini
# backend/.env.development.local — e.g. send real email
EMAIL_BACKEND=resend
RESEND_API_KEY=re_...
FROM_EMAIL="You <you@yourdomain.com>"
OWNER_EMAIL=you@example.com
```

`tsx watch` doesn't reload on env edits — restart `pnpm dev` after changing
backend env. `backend/.env` is **no longer read**; if you have one from the
old setup, move its values into `backend/.env.development.local` (the backend
warns at startup while a `backend/.env` exists). Every variable is documented
inline in the committed files and in
[`deployment.md § Environment variable reference`](./deployment.md#environment-variable-reference).

### Sanity Studio (optional)

Sanity is a hosted content lake, so the Studio can't run without a real
Sanity project — there's no local emulator, and we don't fake one. **You don't
need it for local dev**: `pnpm dev` doesn't start it, and the site runs on the
local sample content. `pnpm studio dev` / `pnpm dev:all` without a project ID
stop immediately with a message pointing here.

To use the Studio, create a **free personal Sanity project**:

1. Log in at https://www.sanity.io/manage and click **Create new project**
   (default dataset `production`). Copy the **Project ID**.
2. `studio/.env.development.local`:
   ```ini
   SANITY_STUDIO_PROJECT_ID=<your project id>
   ```
3. `pnpm studio dev` → [http://localhost:3333](http://localhost:3333), sign in,
   create content, click **Publish**.
4. To have the site read that project instead of the sample content, point
   the backend and frontend at it too:
   ```ini
   # backend/.env.development.local
   CONTENT_BACKEND=sanity
   SANITY_PROJECT_ID=<your project id>
   SANITY_API_TOKEN=<Editor token from the project's API → Tokens tab>

   # frontend/.env.development.local (image URLs on Sanity's CDN)
   PUBLIC_SANITY_PROJECT_ID=<your project id>
   ```
   Restart `pnpm dev`. Shop and gallery fetch at runtime, so newly published
   content appears on refresh. With `CONTENT_BACKEND=sanity`, orders are
   written to your Sanity project as well.

The Studio's order PII panels call the local backend with
`local-dev-admin-token` — no extra config.

## Maintainers: production parity and deploying

Only needed if you work against the **production** Sanity project or deploy.
Not needed for everyday local development.

The real secrets live KMS-encrypted in the sibling **private** repo
`Absence0760/infra-secrets` (under `meryl-green-designs/`) — never in this
public repo. Decrypting needs `kms:Decrypt` on the project key via AWS SSO
(configure a profile per
[`deployment.md § AWS profiles`](./deployment.md#aws-profiles-multi-project-setup)
so credentials don't bleed across projects):

```bash
git clone git@github.com:Absence0760/infra-secrets.git ../infra-secrets   # one-time
aws sso login --profile mgd-jaredhoward
sops ../infra-secrets/meryl-green-designs/.env.sops      # edit secrets in $EDITOR; re-encrypts on save
sops -d ../infra-secrets/meryl-green-designs/.env.sops > backend/.env.development.local
```

The decrypted file overrides the committed defaults key by key. If it doesn't
set `CONTENT_BACKEND=sanity`, add that line, or the backend keeps serving the
local sample content. Put the production project ID in
`frontend/.env.development.local` (`PUBLIC_SANITY_PROJECT_ID`) and
`studio/.env.development.local` (`SANITY_STUDIO_PROJECT_ID`) too — those are
non-secret. The full SOPS workflow is in
[`deployment.md § Secrets management`](./deployment.md#secrets-management);
`bin/setup.sh` is the production bootstrap, not a local-dev step.

**Optional backend variables:**
- `SANITY_WEBHOOK_SECRET` — only needed if you're testing the order-status
  email webhook locally (via ngrok or similar)
- `AUTO_CANCEL_DAYS` — number of days a `pending_payment` order may sit
  before the daily auto-cancel sweep flips it to `cancelled`. Defaults
  to **30** if unset. Only read by the standalone auto-cancel handler
  (`backend/src/auto-cancel-lambda.ts`), which talks to Sanity directly and
  has no local mode; the HTTP backend ignores it.

### Setting up local DynamoDB

The backend writes customer order PII to a private DynamoDB table (see
[`orders-pii-split.md`](./orders-pii-split.md) for the
architecture). Local dev runs against a `docker compose` LocalStack
container that emulates the DynamoDB API on `:4566` —
production hits the AWS-hosted table, and the two are isolated:
**`bin/dynamodb-local-up.sh` will never touch the prod table**.

(Why LocalStack and not `amazon/dynamodb-local`: the Java/Jetty image
reproducibly hangs the AWS SDK on Fedora 43 / kernel 6.19. See
`docker-compose.yml` for the full note.)

```bash
pnpm dev:db:up    # or directly: ./bin/dynamodb-local-up.sh
```

This is idempotent. It:

1. Starts the `localstack` service from `docker-compose.yml` if it
   isn't already running (edge gateway on port `4566`, persistent volume).
2. Waits for LocalStack's `/_localstack/health` to report DynamoDB ready.
3. Creates the `meryl-green-designs-orders` table on first run with the
   same schema as prod (`orderRef` hash key, `ttl` for auto-deletion).
4. Enables TTL on the `ttl` attribute (LocalStack accepts the API but
   doesn't actually expire items — TTL behaviour is only verified against
   real prod DynamoDB).

The backend reads `DYNAMODB_ENDPOINT=http://localhost:4566` from the
committed `backend/.env.development` and routes the SDK there with dummy credentials. **If
`DYNAMODB_ENDPOINT` is unset, the SDK falls back to the real AWS
service** — only happens in prod, where the Lambda's IAM role provides
real credentials.

Container lifecycle (all run from repo root):

```bash
pnpm dev:db:down     # stop, keep data
pnpm dev:db:reset    # stop, wipe volume, restart, recreate table
pnpm dev:db:scan     # see what's currently in the local table
```

Without local DynamoDB running, the rest of the site works, but
`POST /orders` returns 500 (the PII write goes first and fails — the
backend log suggests `pnpm dev:db:up`), and `/track`, payment retry and
the admin routes behind the Studio's PII panels return errors.

#### Backfilling local DynamoDB from Sanity

If you want every existing Sanity order document to appear in the local
DynamoDB (useful for testing the Studio PII panels against real
historical data), run:

```bash
pnpm backfill:orders:dry   # report-only, no writes
pnpm backfill:orders       # actually write
```

Idempotent — re-running skips rows already present. The script reads
the same `SANITY_*` and `ORDERS_TABLE_NAME` / `DYNAMODB_ENDPOINT` env
vars as the live backend, so by default it writes to whatever DynamoDB
endpoint your backend env (`.env.development` + `.env.development.local`) points at — meaning **the local
`docker compose` container, not prod AWS**. Verify before running by
glancing at the `DYNAMODB_ENDPOINT: http://localhost:4566` line in the
script's startup banner.

`--overwrite` forces an unconditional re-import (slower; only use if
you suspect drift between Sanity and DynamoDB).

A reverse-backfill is wired up for the Phase 1 rollback case:

```bash
pnpm restore:sanity-pii:dry                     # report-only
pnpm restore:sanity-pii                         # patch Sanity from DynamoDB
pnpm restore:sanity-pii -- --overwrite --yes    # rare; clobbers operator edits
```

Post-cutover (Phase 1 live since 2026-05-13), this script writes the
DynamoDB PII fields back onto the Sanity skeleton — only used in a
genuine rollback. The dry-run is the safest way to verify the rollback
path still works against real data.

And `scrub:sanity-pii` deletes any historical PII fields still attached
to old Sanity order documents (the cleanup step after the cutover):

```bash
pnpm scrub:sanity-pii:dry                       # report-only
pnpm scrub:sanity-pii                           # actually delete
```

#### Safety gates on the backfill/restore scripts

**Backfill** refuses non-dry writes against real AWS unless `--prod` is
passed (the absence of `DYNAMODB_ENDPOINT` is the signal). Local runs
keep the env var set and the gate is invisible.

**Restore** is stricter: because Sanity is a single-dataset prod-only
resource, every non-dry restore is a prod Sanity write. `--prod` is
**required for any wet restore**, even when reading from local
DynamoDB. The dry-run preview still works without it.

**`--overwrite` on restore** additionally requires `--yes` so a typo
can't clobber Meryl's edits.

**Backend startup guard:** `backend/src/dynamo.ts` refuses to construct
a client that would reach real AWS unless one of three conditions
holds — `DYNAMODB_ENDPOINT` is set (local dev),
`AWS_LAMBDA_FUNCTION_NAME` is set (running in the deployed Lambda), or
`ALLOW_REAL_AWS=1` is set (scripts opt-in this themselves after their
`--prod` gate clears). A misconfigured `backend/.env.development.local` that blanks
`DYNAMODB_ENDPOINT` while you have an active AWS SSO session will fail
fast at server startup instead of silently writing to the prod table.

All gates are bypassed when `--dry-run` is in effect, so previewing is
always cheap.

### Local email capture

`backend/src/email.ts` has two backends, switched via `EMAIL_BACKEND`:

| Value | Behaviour |
|---|---|
| unset / `resend` (default) | Real HTTP call to `api.resend.com`; needs `RESEND_API_KEY` + `FROM_EMAIL`. |
| `file` | Renders the email to disk; no external calls; works without Resend creds. |

`EMAIL_BACKEND=file` is the committed `backend/.env.development` default: every `sendEmail()` call
writes a self-contained HTML file to `backend/.dev-emails/` like
`2026-05-13T15-30-00-000Z-your-order-mg-260513-ab12.html` with the
recipient/subject/replyTo in HTML comments at the top. The backend logs
the absolute `file://` URL to stdout — most terminals make it clickable:

```
[email:file] jane@example.com <- Your order MG-260513-AB12 -> file:///home/.../.dev-emails/...html
```

Open the newest file in a browser:

```bash
pnpm dev:emails   # or manually: xdg-open backend/.dev-emails/$(ls -t backend/.dev-emails | head -1)
```

`backend/.dev-emails/` is gitignored. **Production must never set
`EMAIL_BACKEND=file`** — leave it unset on the Lambda; Terraform
doesn't pass it through.

### Local content preview (no Sanity)

For previewing new products or photos before they go into Sanity, the
public content getters in `backend/src/sanity.ts` can read from disk
instead, switched via `CONTENT_BACKEND`:

| Value | Behaviour |
|---|---|
| unset / `sanity` (default) | Products, gallery and testimonials come from Sanity; needs `SANITY_PROJECT_ID` + `SANITY_API_TOKEN`. |
| `local` | Reads `backend/.dev-content/content.json` (re-read on every request, so edits show on refresh) and serves photos from `backend/.dev-content/images/` — falling back to the committed `backend/dev-content.sample/` when you have no `content.json` of your own. No Sanity, no network, no secrets. |

**Sample content.** Until you create your own
`backend/.dev-content/content.json`, the backend reads the committed
sample in `backend/dev-content.sample/` (a few generic products across
both categories, two gallery photos, a testimonial — placeholder copy
and images only, all labelled "sample"). To preview your own content,
copy it and edit the copy:

```bash
cp -R backend/dev-content.sample/. backend/.dev-content/
```

Keep the committed sample generic: this repo is public, and
`backend/src/__tests__/dev-content-sample.test.ts` checks it stays
small, labelled, and self-consistent.

`content.json` holds the same shapes the backend returns from Sanity
(`SanityProduct`, `SanityGalleryPhoto`, `SanityTestimonial` in
`backend/src/sanity.ts`). Any section can be omitted. A product's
`category` is `"screen"` or `"cushion-cover"`; leave it out and it
defaults to `"screen"`, the same as Sanity documents created before the
field existed. Point a photo at a local file by giving it the asset ref
`local:<file name>`:

```json
{
  "products": [
    {
      "_id": "local-lion-pride-screen",
      "name": "Lion Pride Screen",
      "slug": "lion-pride-screen",
      "category": "screen",
      "blurb": null, "description": null, "priceZar": null, "dimensions": null,
      "available": true,
      "order": 10,
      "photos": [
        { "_key": "p1", "alt": "…", "asset": { "_ref": "local:lion-screen-front.jpg" } }
      ]
    },
    {
      "_id": "local-wild-amaryllis-cushion-cover",
      "name": "Wild Amaryllis Cushion Cover",
      "slug": "wild-amaryllis-cushion-cover",
      "category": "cushion-cover",
      "blurb": null, "description": null, "priceZar": 450, "dimensions": "60 × 60 cm",
      "available": true,
      "order": 100,
      "photos": [
        { "_key": "p1", "alt": "…", "asset": { "_ref": "local:wild-amaryllis-cushion.jpg" } }
      ]
    }
  ],
  "galleryPhotos": [],
  "testimonials": []
}
```

The frontend's `imageUrl()` maps `local:` refs to
`${PUBLIC_API_URL}/dev-content/images/<file>`, and the backend only
registers that route when `CONTENT_BACKEND=local`. Width, crop and
hotspot are ignored for local photos (they're served as-is), so
pre-size them to about 1600–2400px. Set `CONTENT_DEV_DIR` to use a
folder other than `.dev-content` (it must be under the backend's working
directory or the OS tmp dir).

Orders work too. In this mode the Sanity order skeleton (orderRef,
status, paymentMethod, amountZar, paymentId — `createOrder`,
`getOrderByRef`, `updateOrderPayment`, `deleteOrder` in `sanity.ts`)
goes to `backend/.dev-content/orders.json` instead (created on first
write; `backend/src/orders-local.ts`). The PII half still goes to
DynamoDB, so checkout, `/track` and the admin routes need LocalStack
running (`pnpm dev:db:up`) — without it `POST /orders` returns 500 and
the backend log says so. Delete `orders.json` to reset local orders.
Customer status emails won't fire: in production the Sanity webhook
sends them, and a local order has no webhook.
`backend/.dev-content/` is
gitignored; this repo is public, so client photos must never be
committed. **Production must never set `CONTENT_BACKEND`**, and
Terraform doesn't pass it through.

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

This starts Sanity Studio on [http://localhost:3333](http://localhost:3333)
once `SANITY_STUDIO_PROJECT_ID` is set (see
[Sanity Studio (optional)](#sanity-studio-optional); without it the command
stops with a pointer there). Sign in with the Sanity account that owns the project. Any products you
create/edit and publish become visible to the frontend within seconds —
the shop and gallery pages fetch from the backend at runtime, so no
rebuild is required.

To publish the studio so Meryl can use it from anywhere:

```bash
pnpm studio deploy
```

Sanity will prompt for a subdomain (e.g. `merylgreendesigns`) and deploy to
`https://merylgreendesigns.sanity.studio`. Free, no AWS involved.

## Running all three at once

Only needed if you're actively developing the studio schema at the same time
as the site. Needs a Sanity project ID for the studio (see
[Sanity Studio (optional)](#sanity-studio-optional)).

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

## End-to-end test

**With the zero-config defaults** (no Sanity): `pnpm dev:db:up && pnpm dev`,
open the shop, add a sample product, check out, and you land on PayFast's
sandbox page. The owner-notification email is in `backend/.dev-emails/`
(`pnpm dev:emails`), the order skeleton in `backend/.dev-content/orders.json`,
the PII row in LocalStack (`pnpm dev:db:scan`), and `/track` finds the order
with the email you used.

**With a Sanity project** (`CONTENT_BACKEND=sanity`, see
[Sanity Studio (optional)](#sanity-studio-optional)), a full run exercises
studio content → frontend rendering → backend order submission → Sanity
order doc → tracking link. Run all three servers (`pnpm dev:all`) and walk
through the steps below.

**1. Publish content in the studio** (http://localhost:3333)

Sign in, create one or two products and a gallery photo, and **click Publish**
— unpublished drafts are invisible to the backend's Sanity queries.

**2. Verify the frontend renders that content** (http://localhost:7777)

- Home page loads.
- **Shop** page shows the products you just published.
- **Gallery** page shows the photo.

If a page stays on the skeleton/empty state, see the "Shop or gallery page
stays on the skeleton" entry under [Common issues](#common-issues).

**3. Submit an order**

On the Shop page, scroll to the order form, fill it in with your own email
address, and submit. In the backend terminal you should see the `POST /orders`
request logged. Two emails arrive shortly: one to `OWNER_EMAIL`, one to the
customer address.

**4. Verify the order doc in Sanity Studio**

A new document appears under **Orders** in the studio. Change its status
(e.g. `pending` → `confirmed`) and click Publish.

**5. Open the tracking link**

The customer email contains a `/track?ref=…&email=…` link. Open it — the
track page should show the current order status.

**6. (Optional) Test the status-change email**

The status-change email fires from a Sanity webhook, which needs a
publicly-reachable backend URL. Skip on the first pass — everything else
works without it. Full walkthrough (ngrok, secret, dashboard config,
filter) in [Testing the Sanity order-status webhook](#testing-the-sanity-order-status-webhook)
below.

## Testing PayFast with sandbox credentials

PayFast provides a public sandbox merchant that anyone can use for testing —
no account registration, no real money moves. Use it to exercise the full
checkout flow locally before wiring up Meryl's real PayFast credentials.

### Sandbox credentials

These are public test values, and they are the committed
`backend/.env.development` defaults — nothing to configure. Never use them
in production.

```ini
PAYFAST_MERCHANT_ID=10004002
PAYFAST_MERCHANT_KEY=q1cd2rdny4a53
PAYFAST_PASSPHRASE=payfast
PAYFAST_SANDBOX=true
```

With `PAYFAST_SANDBOX=true` the backend signs form data against
`https://sandbox.payfast.co.za/eng/process` instead of the live endpoint.
Browsing that URL directly returns a 400 — it only accepts POST with signed
fields, which the frontend auto-submits after `POST /orders` succeeds.

Restart the backend (`Ctrl+C` and re-run `pnpm backend dev`) after editing
a backend env file — `tsx watch` does not auto-reload on env changes.

### Smoke-test the order endpoint

```bash
# Grab a product ID (the local sample has e.g. sample-acacia-screen)
curl -s http://localhost:3001/products | head -c 400

# Place an order (replace PRODUCT_ID; needs LocalStack: pnpm dev:db:up)
curl -i -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:7777' \
  -d '{"name":"Test User","email":"you@example.com","phone":"0821234567","address":"1 Main St, Cape Town, 8001","notes":"","cart":[{"productId":"PRODUCT_ID","quantity":1}],"paymentMethod":"payfast"}'
```

A healthy response is `HTTP/1.1 200` with a `payfast` block in the body:

```json
{
  "success": true,
  "ref": "MG-260417-XXXXXX",
  "payfast": {
    "action": "https://sandbox.payfast.co.za/eng/process",
    "fields": { "merchant_id": "10004002", "signature": "...", ... }
  }
}
```

Common failure modes:

- **`500 "Payment processing is not configured."`** — one of the four
  `PAYFAST_*` vars is empty. Check `grep PAYFAST backend/.env.development*` (a blank value in `.env.development.local` wins) and restart.
- **`200` with `warning` but no `payfast` block** — the owner notification
  email failed (usually missing/invalid `RESEND_API_KEY`), which early-returns
  before payment form data is built. Fix Resend config and retry.
- **`400 "Please enter your name."` (or similar)** — request body shape is
  wrong. The backend expects top-level `name`/`email`/`phone`/`address`/`notes`
  plus a `cart` of `{productId, quantity}` objects — **not** nested under
  `customer` and **not** `slug`.

### Full round-trip via the UI

Fastest way to see the sandbox checkout page render:

1. `pnpm dev`
2. Browser → http://localhost:7777/shop
3. Add a product → check out → fill the form → submit
4. The browser auto-submits a hidden form to sandbox PayFast; you land on
   their hosted payment page
5. Pay with the sandbox test card below (or click "Complete Payment")
6. PayFast redirects to `/payment/complete?ref=MG-...`

#### Sandbox test cards

| Card number | Outcome |
|---|---|
| `4000 0000 0000 0002` | Visa — always approves |
| `5200 0000 0000 0015` | Mastercard — always approves |

CVV: any 3 digits. Expiry: any future date.

### Enabling ITN callbacks with ngrok

The steps above exercise order creation and the customer redirect, but
**PayFast's ITN webhook won't reach your laptop** — `notify_url` defaults
to `http://localhost:3001/webhooks/payfast-itn`, which PayFast's servers
can't resolve. Without ITN, orders stay on `pending_payment` in Sanity
even after "paying" in the sandbox.

To close the loop, expose the backend with ngrok:

**1. Install and authenticate** (one-time)

ngrok has no dnf/apt package; download the official tarball and drop
the binary on your `PATH` (e.g. `~/.local/bin/`):

```bash
curl -fsSL https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz \
  | tar -xz -C ~/.local/bin/ ngrok
# Grab your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
ngrok config add-authtoken <YOUR_TOKEN>
```

On macOS use `brew install ngrok` instead.

**2. Start the tunnel** (leave running in its own terminal)

```bash
ngrok http 3001
```

Copy the `https://<random>.ngrok-free.app` URL from the forwarding line.

**3. Update `backend/.env.development.local`**

```ini
API_URL=https://<random>.ngrok-free.app
```

Restart the backend. New orders will have the ngrok URL baked into their
`notify_url`. (Orders placed *before* the change keep the old URL and their
ITN will never arrive — that's fine for testing, just place a fresh order.)

**4. Verify the ITN arrives**

Place and complete a new sandbox order. You should see:

- A `POST /webhooks/payfast-itn` line in the ngrok terminal (200 response)
- No `PayFast ITN: invalid signature` / `not found` warnings in the backend
  logs — the ITN route only logs on failures, so silence is success
- The order status flip from `pending_payment` to `payment_received` in
  Sanity Studio at :3333, with the `paymentId` field populated

**Gotchas:**

- ngrok's free tier assigns a new URL on every restart. Restart ngrok →
  update `API_URL` → restart the backend. Paid plans offer stable subdomains.
- The `ngrok-free.app` browser warning page only affects GET requests from
  browsers; PayFast's server-to-server POST bypasses it.
- If the ITN signature fails, double-check `PAYFAST_PASSPHRASE=payfast`
  (lowercase, exactly). A wrong passphrase produces a silently-invalid
  signature with no obvious error.

### Moving to production

Once the sandbox flow works end-to-end, swap to Meryl's real credentials.
She'll provide them after registering at [payfast.co.za](https://payfast.co.za)
(needs SA bank account + ID) and activating her account for the payment
methods you want to accept. Set `PAYFAST_SANDBOX=false` (or unset it) and
populate the real `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and
`PAYFAST_PASSPHRASE` via
[`deployment.md § Secrets management`](./deployment.md#secrets-management).

## Testing the Sanity order-status webhook

PayFast's ITN flips orders to `payment_received` in Sanity, but the customer
"payment received" email doesn't fire automatically — it's sent by the
**Sanity webhook**, which POSTs to `/webhooks/sanity-order` whenever an
order's `status` field changes. To test this end-to-end locally you need
three things: a shared secret in `backend/.env.development.local`, a webhook configured in
Sanity's dashboard, and the same ngrok tunnel used for PayFast ITN.

This is optional — everything except customer status emails works without
it. Skip on first pass, come back when you want to verify the email flow.

### 1. Generate the shared secret

```bash
openssl rand -hex 32
```

Paste the output into `backend/.env.development.local`:

```ini
SANITY_WEBHOOK_SECRET=<the-hex-string>
```

Restart the backend. The **same** string goes into Sanity's webhook
configuration below — Sanity uses it to sign each webhook request and the
backend rejects requests whose signature doesn't verify.

### 2. Create the webhook in the Sanity dashboard

1. Open https://www.sanity.io/manage → your project → **API** tab →
   **Webhooks** → **Create webhook**.
2. Fill in:

| Field | Value |
|---|---|
| **Name** | `Order status email` |
| **Dataset** | `production` (or whichever dataset holds orders) |
| **URL** | `https://<your-ngrok>.ngrok-free.app/webhooks/sanity-order` |
| **Trigger on** | **Update** only (uncheck Create and Delete) |
| **Filter** (GROQ) | `_type == "order" && delta::changedAny(status)` |
| **Projection** | leave blank (defaults to full document) |
| **HTTP method** | `POST` |
| **API version** | latest (e.g. `v2025-01-01`) |
| **Secret** | the hex string from step 1 |

3. Save.

The GROQ filter is important: without it, **any** edit to an order doc
(adding a tracking number, fixing a typo) would re-fire the status email
and spam the customer. `delta::changedAny(status)` restricts the webhook
to transitions only.

### 3. Trigger a status change and verify

- Open Sanity Studio (http://localhost:3333) → **Orders** → find the
  order you just paid for (status should be `payment_received`)
- Change the status to `confirmed` (or any other value) → **Publish**
- Watch the backend logs — you should see a `POST /webhooks/sanity-order`
  line and an email send log
- Watch the ngrok terminal — same `POST /webhooks/sanity-order 200`
- Check the customer inbox (use a plus-alias of your Resend signup email,
  e.g. `you+customer@example.com`, so Resend's sandbox sender
  will actually deliver it)

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401` in backend logs | Secret mismatch between `backend/.env.development.local` and the Sanity dashboard |
| `404` / connection refused | Stale ngrok URL in the Sanity webhook, or backend not running |
| `200` but no email | Resend sandbox sender only delivers to your Resend signup address. Plus-aliases of that address work; a random third-party email won't. |
| No webhook fires at all | Filter too restrictive — Sanity only fires on `delta::changedAny(status)`. If you edited a different field, nothing fires. |

The ngrok URL is shared with PayFast's ITN — same tunnel handles both. If
you restart ngrok, update both `API_URL` in `backend/.env.development.local` and the webhook
URL in the Sanity dashboard.

## Quick backend smoke test

To confirm the backend is up without touching the frontend:

```bash
curl http://localhost:3001/health
# {"ok":true}
```

To exercise `POST /orders` without the UI, see the curl example under
[Testing PayFast with sandbox credentials § Smoke-test the order endpoint](#smoke-test-the-order-endpoint)
— with the committed defaults, `sample-acacia-screen` is a valid product ID
and the PayFast sandbox creds are already set; LocalStack must be up.

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

## Running tests

```bash
pnpm test                 # runs tests in all workspace packages
pnpm backend test         # backend only (Vitest + Hono app.request harness)
pnpm frontend test        # frontend only (Vitest, helpers in src/lib)
pnpm backend test:watch   # watch mode
pnpm frontend test:watch
```

Tests mock Sanity and Resend, so they never hit real services and don't
need a network connection or any environment variables beyond what the
test setup files provide. The full suite runs in well under a second.

## Common issues

**`PUBLIC_API_URL` is not defined at build time**
: The frontend inlines `PUBLIC_API_URL` at build time via `$env/static/public`.
  `pnpm frontend dev` / `check` read it from the committed
  `frontend/.env.development`. A production `vite build` doesn't read that
  file and fails fast when `PUBLIC_*` isn't in the environment — use
  `pnpm frontend build --mode development` for a local build.

**CORS errors in the browser when submitting the order form**
: `ALLOWED_ORIGINS` (backend env) must include the frontend origin. For
  local dev this is `http://localhost:7777` (the default).

**Port already in use**
: Frontend dev server is hard-coded to port 7777 in `frontend/package.json`.
  Backend respects the `PORT` env var; change it in `backend/.env.development.local` if 3001 is
  taken.

**Emails not arriving**
: By default they aren't sent — `EMAIL_BACKEND=file` writes them to
  `backend/.dev-emails/` (`pnpm dev:emails`). With `EMAIL_BACKEND=resend`, check `RESEND_API_KEY` is valid and `FROM_EMAIL` is from a verified domain in
  your Resend dashboard. During initial setup, Resend's sandbox address
  (`onboarding@resend.dev`) is the fastest way to test.

**Order form fails silently**
: Open the browser devtools Network tab. The request to `/orders` will show the
  actual error from the backend. Most common locally: LocalStack isn't
  running (`pnpm dev:db:up`) — the backend log says so. Otherwise a blank
  `OWNER_EMAIL` in `backend/.env.development.local`.

**Shop or gallery page stays on the skeleton / empty state even after adding content**
: Shop and gallery fetch from the backend at runtime, so the usual causes
  are backend-side:
  1. **Backend isn't running.** `pnpm dev` starts both frontend and backend.
     Confirm with `lsof -i :3001` or `curl http://localhost:3001/health`.
  2. **Backend `SANITY_API_TOKEN` is missing or wrong** in
     `backend/.env.development.local` (only with `CONTENT_BACKEND=sanity`;
     the default local mode needs no Sanity).
     Without the token, the backend returns 500 on `/products` and `/gallery`.
     Check the backend terminal for `SANITY_PROJECT_ID is not configured` or
     authentication errors.
  3. **Backend `SANITY_PROJECT_ID` is missing or doesn't match** the studio
     project.
  4. **`tsx watch` hasn't picked up env changes.** `tsx watch` does not
     auto-reload on `.env.development*` edits. Stop and restart `pnpm dev` after changing
     backend env vars.
  5. **Content saved as drafts, not published.** Click **Publish** in Sanity
     Studio — unpublished drafts are invisible to the API.
  6. **Browser devtools → Network tab** shows you exactly what the backend
     returned. Click the failing `/products` or `/gallery` request to see
     the actual error message.

**Studio fails to start with "SANITY_STUDIO_PROJECT_ID is not set"**
: Expected without a Sanity project — the Studio is optional. To use it, set
  `SANITY_STUDIO_PROJECT_ID` in `studio/.env.development.local`; see
  [Sanity Studio (optional)](#sanity-studio-optional).

## End-to-end tests (Playwright)

The `playwright/` workspace drives the whole order flow through a
real Chromium browser against the live backend + frontend + LocalStack
DynamoDB + a dedicated `test-e2e` Sanity dataset.

**First-time setup is documented in
[`playwright/README.md`](../playwright/README.md)** — short version:

1. Create a second Sanity project for testing (Free plan).
2. `cp playwright/.env.example playwright/.env`, fill in
   `SANITY_PROJECT_ID`, `SANITY_API_TOKEN`, plus a couple of
   random `openssl rand -hex 32` values.
3. `pnpm dev:db:up` (LocalStack on `:4566`).
4. `pnpm --filter @meryl-green-designs/playwright install-browsers`.

Then any of:

```bash
pnpm --filter @meryl-green-designs/playwright test            # headless
pnpm --filter @meryl-green-designs/playwright test:headed     # watch the browser
pnpm --filter @meryl-green-designs/playwright test:ui         # Playwright UI
```

Playwright's `webServer` config will spawn `pnpm backend dev` and
`pnpm frontend dev` automatically (or reuse them if they're already
running). The suite **never** touches production — `global-setup.ts`
aborts the run with a clear error if the env points anywhere near
real prod (Sanity dataset, DynamoDB endpoint, PayFast merchant id,
email backend). See `playwright/helpers/env-guard.ts` for the full
check.

## Next step: deploying

Once the site runs correctly on your machine, see
[`deployment.md`](./deployment.md) for the first-time AWS deployment
walkthrough (Terraform apply, GitHub Actions setup, Sanity webhook wiring).

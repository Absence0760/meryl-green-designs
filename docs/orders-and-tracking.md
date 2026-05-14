# Orders & tracking

**Status: implemented + Phase 1 cutover landed.** Customer order PII now
lives in a private AWS DynamoDB table; the Sanity order document holds
only the non-PII skeleton (`orderRef`, `status`, `paymentMethod`,
`amountZar`, `paymentId`). The Studio's three custom panels
(`CustomerDetailsPanel`, `TrackingFields`, `InternalNotesField`) fetch
PII from the backend's `/admin/*` routes, which read DynamoDB directly.
Customers track their order at `/track` as before — the backend joins
both stores and returns a unified shape. Status updates in the Studio
trigger automatic emails via the Sanity webhook (now joining DynamoDB to
recover the customer's email). See
[`orders-pii-split-plan.md`](./orders-pii-split-plan.md) for the
migration history.

The detail below was written for the original Sanity-only design and
still describes that surface where it matters for the customer-facing
parts. Where the implementation now differs from this text, the Phase 1
note in this status block is canonical.

## Problem

Today, orders exist only as emails. When a customer submits the order form, the
backend sends a notification to Meryl's inbox and a confirmation to the customer.
Meryl then tracks the order by reading her emails and manually replying at each
state change ("payment received", "shipped", "delivered").

This works for ~0–5 orders per month. Past that:

- Meryl has to compose status emails by hand every time.
- Customers have no way to check on their order without emailing her.
- There is no single source of truth for order state — it's spread across emails,
  bank statements, and Meryl's memory.

## Goal

Make orders first-class data, managed by Meryl in the Sanity Studio she already
uses. Give customers a public page where they can check the status of their
order using its reference + email. Automate status emails so Meryl only has to
update the status in one place.

## Design overview

```
Customer submits order
       │
       ▼
Backend creates order document in Sanity   ◄── new
       │
       ▼
Backend sends "pending payment" email to customer + notification to owner
       │
       │
       │  (later: Meryl eyeballs her bank, opens Sanity Studio,
       │   changes status from "Pending payment" → "Payment received")
       │
       ▼
Sanity fires webhook to backend             ◄── new
       │
       ▼
Backend verifies signature, looks up new status, sends matching email   ◄── new
       │
       ▼
Customer receives "payment received" email
```

Same pattern repeats for subsequent status changes (shipped, delivered, cancelled).

Separately, the customer can visit `/track` at any time:

```
Customer enters ref + email on /track
       │
       ▼
Frontend fetches GET /orders/:ref?email=… from backend
       │
       ▼
Backend queries Sanity, verifies email matches, returns sanitised order
       │
       ▼
Frontend displays status, shipping info, tracking number (if present)
```

## Data model — Sanity `order` schema

A new document type alongside the existing `product`. Proposed shape:

```typescript
// studio/schemas/order.ts  (PROPOSED — not yet created)
import { defineField, defineType } from 'sanity';

export const order = defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  // Meryl can edit these freely; the backend creates them via API token.
  fields: [
    defineField({
      name: 'orderRef',
      title: 'Order reference',
      type: 'string',
      readOnly: true,
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Pending payment', value: 'pending_payment' },
          { title: 'Payment received', value: 'payment_received' },
          { title: 'Shipped', value: 'shipped' },
          { title: 'Delivered', value: 'delivered' },
          { title: 'Cancelled', value: 'cancelled' }
        ],
        layout: 'radio'
      },
      initialValue: 'pending_payment',
      validation: (rule) => rule.required()
    }),

    // --- Customer ---
    defineField({ name: 'customerName', title: 'Customer name', type: 'string' }),
    defineField({ name: 'customerEmail', title: 'Customer email', type: 'string' }),
    defineField({ name: 'customerPhone', title: 'Customer phone', type: 'string' }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping address',
      type: 'text',
      rows: 3
    }),

    // --- Order contents ---
    defineField({
      name: 'items',
      title: 'Items',
      type: 'text',
      rows: 4,
      description: 'What the customer said they wanted (free text for now).'
    }),
    defineField({
      name: 'customerNotes',
      title: 'Customer notes',
      type: 'text',
      rows: 2
    }),

    // --- Shipping (populated when status → shipped) ---
    defineField({ name: 'trackingNumber', title: 'Tracking number', type: 'string' }),
    defineField({ name: 'trackingUrl', title: 'Tracking URL', type: 'url' }),
    defineField({ name: 'shippingCarrier', title: 'Shipping carrier', type: 'string' }),

    // --- Private ---
    defineField({
      name: 'internalNotes',
      title: 'Internal notes (never shown to customer)',
      type: 'text',
      rows: 3
    })
  ],
  orderings: [
    {
      title: 'Newest first',
      name: 'createdDesc',
      by: [{ field: '_createdAt', direction: 'desc' }]
    }
  ],
  preview: {
    select: {
      title: 'orderRef',
      subtitle: 'customerName',
      status: 'status'
    },
    prepare({ title, subtitle, status }) {
      return {
        title: `${title} — ${subtitle || 'Unknown'}`,
        subtitle: `Status: ${status}`
      };
    }
  }
});
```

### Status values and transitions

```
pending_payment ──► payment_received ──► shipped ──► delivered
      │                     │                │
      └─────► cancelled ◄───┴────────────────┘
```

- `pending_payment` — initial state, set when the backend creates the document.
- `payment_received` — set automatically by the PayFast ITN handler when
  payment completes, or manually by Meryl if she has confirmed payment
  some other way.
- `shipped` — dispatched. `trackingNumber` should be filled in at this point.
- `delivered` — optional terminal state. Could be set manually or skipped.
- `cancelled` — abandoned order. Reason can go in `internalNotes`.

There is no validation preventing "illegal" transitions (e.g. `shipped` back to
`pending_payment`). Meryl has full access and can set any status at any time.
Trying to enforce transitions adds UX friction for a small site where she may
legitimately need to correct a mistake.

## Flows

### 1. Creating an order

`POST /orders` accepts a JSON body with customer details and a structured
`cart` array (`{ productId, quantity }[]`). The handler:

1. Validate the body (required fields present, email looks like an email,
   honeypot empty, cart non-empty).
2. Look up the cart's products in Sanity (`getProductsByIds`) so the price
   per item comes from the dataset, not from the client. Compute the total
   server-side.
3. Generate the ref `MG-YYMMDD-XXXXXX` (6 base-36 chars).
4. **Create a Sanity order document** via `@sanity/client` using a write
   token (`SANITY_API_TOKEN`), with `status: 'pending_payment'`,
   `paymentMethod: 'payfast'`, and `amountZar` set to the computed total.
5. Send the owner notification email. The customer-facing
   acknowledgement is deliberately not sent at this point — PayFast's
   redirect lands the customer on `/payment/complete`, and the
   `payment_received` email (triggered by the Sanity webhook) is what
   they receive. The fallback `pending_payment` template only fires if
   Meryl manually resets an order.
6. Build signed PayFast form data (`backend/src/payfast.ts`).
7. Return `{ success: true, ref, payfast: { action, fields } }`. The
   browser auto-submits the hidden form to PayFast's hosted checkout.

Failure modes:

- **Sanity create fails**: the whole request fails with 500. No PayFast
  redirect, no owner email. Customer sees an error and can retry.
- **Owner notification fails after Sanity create succeeds**: the order
  exists in Sanity and the customer is still redirected to PayFast.
  Meryl will see the order in Studio when payment completes (the ITN
  handler updates the status). Acceptable trade-off.
- **PayFast signature/build fails**: 500, but the order document
  already exists in Sanity. Meryl can chase it manually. Rare in
  practice — signature generation is local crypto.

### 2. Updating an order status (new)

1. Meryl logs into Sanity Studio (already does this for products).
2. Navigates to Orders → picks an order.
3. Changes the `status` radio button.
4. Optionally fills in `trackingNumber`, `trackingUrl`, `shippingCarrier`.
5. Clicks **Publish**.
6. Sanity fires a webhook to the backend.

Webhook payload includes the updated document. Backend receives
`POST /webhooks/sanity-order`:

1. Verify signature (HMAC-SHA256 of raw body against `SANITY_WEBHOOK_SECRET`).
   Reject with 401 if it doesn't match.
2. Parse the document from the body.
3. Look up the email template matching the new status.
4. Send the email via Resend to `customerEmail`.
5. Return 200 — even if the send throws. Sanity retries aggressively on
   non-2xx responses, and the retry payload is frozen at event time, so a
   permanently-invalid recipient (e.g. Resend sandbox validation rejection)
   would retry for hours and crowd out fresh events. Log the failure; the
   operator can re-trigger manually by bumping the doc status.

Detecting "status actually changed":

Sanity webhooks don't include "previous value". Options:

- **Send email on every publish, always** — simple, but means editing an
  internal note re-emails the customer. Bad.
- **Use Sanity's GROQ webhook filter to only fire when `status` is in the delta**
  — Sanity's webhook filter supports `delta::changedAny(status)`. This fires
  the webhook ONLY when the `status` field specifically has changed since the
  previous version. This is the correct approach.
- **Track a "lastEmailedStatus" field in the document, compare on each webhook**
  — works without filter support but clutters the schema.

**Recommendation:** use Sanity's webhook filter
`_type == "order" && delta::changedAny(status)` so the webhook only fires on
actual status changes.

### 3. Customer tracks an order (new)

Frontend route `/track` — a new page. Client-side rendered (it's dynamic by
nature, no point prerendering).

1. Page shows a small form: **Order reference**, **Email**, **Look up order**.
2. The page also accepts these as query params (`?ref=…&email=…`) so links from
   emails auto-fill the form.
3. On submit, fetch `GET ${PUBLIC_API_URL}/orders/:ref?email=…`.
4. Backend handler:
   - Query Sanity: `*[_type == "order" && orderRef == $ref][0]`.
   - If nothing found, return 404.
   - If found but `customerEmail.toLowerCase() !== providedEmail.toLowerCase()`,
     return 404 (not 403 — we don't want to reveal that the ref exists).
   - Otherwise return a sanitised subset of the order:
     ```json
     {
       "ref": "MG-260410-ABCD",
       "status": "shipped",
       "customerName": "Jane Smith",
       "items": "1 x Small screen — R 450",
       "shipping": {
         "carrier": "Courier Guy",
         "trackingNumber": "CG123456",
         "trackingUrl": "https://www.courierguy.co.za/track/CG123456"
       },
       "createdAt": "2026-04-10T10:30:00Z",
       "statusUpdatedAt": "2026-04-12T14:00:00Z"
     }
     ```
     Note the absence of `internalNotes`, `customerPhone`, `shippingAddress`.
5. Frontend renders a status card: big status label, progression indicator
   (pending → received → shipped → delivered), tracking link if present.

## Backend changes

New files and changes:

```
backend/src/
├── sanity.ts                   NEW  Sanity write client wrapper
├── routes/
│   ├── orders.ts               MODIFIED  creates Sanity doc before sending emails
│   ├── order-lookup.ts         NEW  GET /orders/:ref?email=…
│   └── sanity-webhook.ts       NEW  POST /webhooks/sanity-order + signature verify
├── email-templates.ts          NEW  extracted from orders.ts, keyed by status
└── app.ts                      MODIFIED  mount the new routes
```

### `backend/src/sanity.ts` (new)

Write client, uses `SANITY_API_TOKEN`. Exports `createOrder()` and `getOrderByRef()`.

### `backend/src/routes/order-lookup.ts` (new)

```
GET /orders/:ref
Query params:
  email (required) — must match the order's customerEmail (case-insensitive)

Response 200:
  { ref, status, customerName, items, shipping, createdAt, statusUpdatedAt }

Response 404:
  { error: "Order not found" }
```

### `backend/src/routes/sanity-webhook.ts` (new)

```
POST /webhooks/sanity-order
Headers:
  sanity-webhook-signature: t=…,v1=…

Body: Sanity document (filtered by the webhook's GROQ filter)

Behaviour:
  1. Read raw body BEFORE Hono parses it (signature is over raw bytes)
  2. Verify HMAC-SHA256 against SANITY_WEBHOOK_SECRET
  3. Parse document from body
  4. Look up email template for the new status
  5. Send email via Resend to customerEmail
  6. Return 200 { ok: true }

Security:
  - Signature mismatch → 401
  - Unknown status → 200 (no-op, don't crash)
  - Missing customerEmail → 200 (no-op, log warning)
```

### New env vars (on the Lambda)

| Var | Sensitive | Purpose |
|---|---|---|
| `SANITY_PROJECT_ID` | no | Same as frontend's `PUBLIC_SANITY_PROJECT_ID` but server-side |
| `SANITY_DATASET` | no | Same as frontend's `PUBLIC_SANITY_DATASET` but server-side |
| `SANITY_API_TOKEN` | **yes** | Write token for creating order documents. Scoped to the `order` type if possible. |
| `SANITY_WEBHOOK_SECRET` | **yes** | Shared secret for verifying webhook signatures |

Added to `infra/variables.tf` with `sensitive = true` on the secret ones, and
to `backend/.env.example` and `backend/.env` for local development.

**Banking details are intentionally not environment variables.** They're not
stored anywhere in the repo, the Lambda, or any automated email — Meryl
sends them by hand as a direct reply to each order. See
[`docs/security.md`](./security.md) for the rationale (impersonation
mitigation, no cryptographic automation).

## Frontend changes

New and modified files:

```
frontend/src/routes/
└── track/
    ├── +page.svelte            NEW  lookup form + status card
    └── +page.ts                NEW  export const prerender = false, csr = true
```

Why `prerender = false` for this route: the content is entirely dynamic and
keyed on runtime query params. Prerendering it would just produce an empty
shell, which is what we'd want anyway — we can let it be a regular
client-rendered page with no SSR penalty since the rest of the site is static.

The `/track` page needs to be listed in the layout nav? Probably not —
customers arrive from their confirmation email, not from discovery. Leave it
out of the main nav, reachable via the link in emails and via direct URL.

## Studio changes

```
studio/schemas/
├── index.ts          MODIFIED  add `order` to the export
└── order.ts          NEW       (schema as shown above)
```

That's it on the Studio side. Once the schema is registered and deployed,
Meryl will see a new "Order" type in the studio sidebar.

## Infrastructure changes

`infra/variables.tf`, `infra/lambda.tf`, `infra/terraform.tfvars.example`:

- Add `sanity_api_token` and `sanity_webhook_secret` variables (both `sensitive = true`)
- Add `sanity_project_id` and `sanity_dataset` variables (not sensitive)
- Pass all four into the Lambda's environment block in `lambda.tf`

No new AWS resources — the Lambda already exists, we're just adding env vars.

## Email templates

Extract to `backend/src/email-templates.ts`:

- `orderCreatedOwner(order)` — notification to Meryl, unchanged from today
- `orderCreatedCustomer(order)` — "thanks, here are bank details, awaiting payment"
- `paymentReceivedCustomer(order)` — "thanks, we've got your payment, shipping soon"
- `shippedCustomer(order)` — "your order is on the way, tracking X"
- `deliveredCustomer(order)` — optional "hope you love it"
- `cancelledCustomer(order)` — "your order was cancelled, refund in N days" or similar

Status → template map lives in `sanity-webhook.ts`.

## Security considerations

### 1. Private dataset + backend-mediated reads

The Sanity `production` dataset is configured as **private**. Anonymous
clients cannot query it — all reads (both products and orders) require an
authenticated client with a valid API token.

- The **backend** has `SANITY_API_TOKEN` and makes all Sanity API calls on
  behalf of the frontend.
- The **frontend** never talks to Sanity's query API directly. At build
  time, its shop loader fetches `${PUBLIC_API_URL}/products` from the
  backend, which in turn reads from Sanity.
- The **frontend still builds Sanity image URLs** via `@sanity/image-url`
  using just the project ID and dataset name. This is fine because Sanity's
  asset CDN (`cdn.sanity.io`) serves image files publicly regardless of
  dataset visibility — only document queries are gated.

This means an attacker who inspects the frontend JS bundle and finds
`PUBLIC_SANITY_PROJECT_ID` still cannot query documents. They can only
construct image URLs for assets they already know about (via the asset
`_ref` which they'd also have to discover).

### 2. Order enumeration

The ref format is `MG-YYMMDD-XXXXXX` where XXXXXX is 6 random base-36
characters → ~2.2 billion combinations per day. Combined with required
email verification on `/orders/:ref` and the per-IP rate limit (20
lookups/min), brute-force enumeration is computationally infeasible.

### 3. Webhook signature verification

The backend verifies Sanity's HMAC-SHA256 signature on every webhook request
against `SANITY_WEBHOOK_SECRET`. The verification runs on the **raw request
body** before JSON parsing, because the signature is computed over raw bytes.
Requests with missing, malformed, or mismatched signatures are rejected with
a 401. Without this check, anyone could POST to `/webhooks/sanity-order` and
trigger fake status emails.

### 4. Rate limiting on `/orders/:ref`

Two layers in place. Per-IP fixed-window limit in `backend/src/rate-limit.ts`
(20 lookups/minute) gates single-source enumeration; AWS API Gateway stage
throttling (`infra/api_gateway.tf`, 50 rps / 100 burst) caps the global
request rate across all callers, which is the defence against
distributed-attacker (botnet) enumeration that the in-memory limiter can't
see.

### 5. Sanity write token scope

The `SANITY_API_TOKEN` should be created with the minimum permissions
possible — ideally a custom role that can only `create` and `read` documents
of type `order`. If Sanity's role granularity doesn't allow that, use an
Editor token and rely on the backend not having the logic to write other
types.

### 6. PII in tracking URLs

The `/track?ref=…&email=…` pattern means the customer's email lands in
browser history and possibly referrer headers. Acceptable trade-off for the
convenience of one-click tracking from a confirmation email. If we want to
harden later, switch to a signed single-use token in the confirmation email
instead of email-in-URL.

### 7. Internal notes / PII in responses

The `/orders/:ref` response shape explicitly omits `internalNotes`,
`customerPhone`, and `shippingAddress`. Enforced at the backend with a
hand-written `sanitise()` function (see `backend/src/routes/order-lookup.ts`)
rather than passing through whatever Sanity returns.

### 8. Banking details are sent by hand, not by any automation

Banking details are not on the public site, not in this repo, and not
injected into any automated email. Meryl sends them manually by replying to
the owner-notification email after she's seen the order. The shop page
explains this flow explicitly so customers know to expect a two-email
sequence (auto acknowledgement → personal reply with bank details).

The `pendingPaymentTemplate()` in `backend/src/email-templates.ts` is
regression-guarded by a test (`never leaks banking details in the
pending-payment email`) that fails if strings like `account number` or
`branch code` start appearing in the automated customer email. See
[`docs/security.md`](./security.md) for the full impersonation threat model.

## PayFast payment integration

PayFast is integrated via the **redirect model** (hosted checkout). The
customer clicks "Pay now" in the cart panel; PayFast's hosted checkout
exposes the full set of supported payment methods (cards, Apple Pay,
SnapScan, etc.) on its own page.

### Payment flow

1. Customer fills the order form, adds products to cart, clicks "Pay now".
2. Frontend sends `POST /orders` with a `cart` array of `{ productId, quantity }`.
3. Backend looks up product prices in Sanity, computes the total server-side
   (prevents client-side amount tampering).
4. Backend creates a Sanity order document with `paymentMethod: 'payfast'`
   and `amountZar` set to the computed total.
5. Backend generates signed PayFast form data and returns it to the frontend.
6. Frontend auto-submits a hidden form to PayFast's URL — customer lands on
   PayFast's hosted payment page.
7. Customer pays with card, Apple Pay, SnapScan, or any supported method.
8. PayFast redirects customer back to `/payment/complete?ref=…`.
9. **Independently**, PayFast sends an ITN (Instant Transaction Notification)
   to `POST /webhooks/payfast-itn`. The backend validates the signature and
   amount, then updates the Sanity order to `payment_received`.
10. The existing Sanity webhook fires and sends the "payment received" email.

### Outgoing form signature

The signature on the form we POST to `/eng/process` is also verified by PayFast
using PHP's `urlencode`. `generateSignature()` therefore runs every field value
through a small `phpUrlEncode()` helper that bridges the gap between JS's
`encodeURIComponent` (which leaves `!*'()~` literal) and PHP's `urlencode`
(which percent-encodes them). Without this, a customer named `O'Brien` or any
value containing `~` produces a signature mismatch and PayFast's hosted page
returns an error to the customer — the order is already in Sanity at
`pending_payment` and never advances to `payment_received` because no ITN
fires.

### ITN signature verification (raw-body)

PayFast signs the ITN POST body using PHP's `urlencode` and **includes empty
fields** (`item_description=&custom_str1=&name_last=&…`) in the signed string.
JS's `encodeURIComponent` encodes a few characters differently (`!*'()~`), and
filtering empty fields changes the set being signed — so parsing the body and
re-signing from the parsed values produces a signature that will never match.

`validateItn()` in `backend/src/payfast.ts` therefore takes the **raw**
URL-encoded body, strips only the `&signature=…` portion, appends
`&passphrase=<urlencoded>` if configured, and MD5s the result. This matches
the exact bytes PayFast signed on their end. Don't refactor it to take a
parsed object — that's how this bug came back the first time.

### New env vars for PayFast

| Var | Sensitive | Purpose |
|---|---|---|
| `PAYFAST_MERCHANT_ID` | no | PayFast merchant ID |
| `PAYFAST_MERCHANT_KEY` | **yes** | PayFast merchant key |
| `PAYFAST_PASSPHRASE` | **yes** | Passphrase for signature generation/verification |
| `PAYFAST_SANDBOX` | no | `'true'` to use sandbox environment |
| `API_URL` | no | Public base URL the backend uses to build the PayFast `notify_url`. In production Terraform sets this to `https://<domain>/api` (the CloudFront-fronted path); in local dev, override with an ngrok tunnel URL so PayFast sandbox ITN callbacks can reach the Hono dev server |

For testing locally against PayFast's public sandbox (including ngrok setup
for ITN callbacks), see
[`run-locally.md § Testing PayFast with sandbox credentials`](./run-locally.md#testing-payfast-with-sandbox-credentials).

### Post-Phase-1 Sanity order schema

After the Phase 1 cutover the Sanity order document holds only the
non-PII skeleton. All customer-facing fields moved to DynamoDB.

| Field | Type | Purpose |
|---|---|---|
| `orderRef` | string | Join key shared with the DynamoDB row |
| `status` | `OrderStatus` | Lifecycle state: `pending_payment`, `payment_received`, `shipped`, `delivered`, `cancelled` |
| `paymentMethod` | `'payfast'` (historical orders may carry `'eft'`) | Which payment path the customer chose |
| `amountZar` | number | Server-computed total in ZAR |
| `paymentId` | string | PayFast transaction ID (set by ITN handler) |

The matching DynamoDB row (table `meryl-green-designs-orders`, hash key
`orderRef`) holds `customerName`, `customerEmail`, `customerPhone`,
`shippingAddress`, `items`, `customerNotes`, `internalNotes`,
`trackingNumber`, `trackingUrl`, `shippingCarrier`, plus a per-item
365-day TTL. See `backend/src/orders-store.ts` for the join.

## What's NOT in this plan

- **Persistent cart** — the cart panel keeps state in memory only. Closing
  the tab or refreshing empties it. Could be persisted to `localStorage`
  if abandonment becomes a concern, but the privacy policy would need
  updating to match.
- **Stock tracking / inventory** — still just the `available` boolean on products.
- **Customer accounts / login** — deliberately omitted. Email + ref is the
  "key" to an order. Much simpler than building auth.
- **Refund handling** — not modelled. `cancelled` status doesn't distinguish
  between "refunded" and "never paid". Add if/when it happens.
- **Multiple shipments per order** — a single order is shipped once, in one
  piece. No split shipments.
- **Order modification after placing** — no edit flow. If a customer needs to
  change their order, Meryl edits the document directly in Sanity and emails
  them manually.
- **Analytics / reporting** — no dashboard for "orders this month". Sanity's
  Studio gives a list view, which is enough for now.

## What still needs to happen (one-time setup)

The code is written and builds clean. Before orders actually flow end-to-end,
some one-time configuration is required — most of it in external dashboards,
not the repo:

1. **Pick a PII mitigation** (see security section above). Do not skip this.
2. **Create the Sanity API token.** In the Sanity dashboard go to
   **API → Tokens → Add API token**, give it a name like "backend-orders",
   assign it the appropriate role (Editor, or a custom role scoped to the
   `order` type for tighter security). Copy the value.
3. **Generate a webhook secret** with `openssl rand -hex 32`. You'll use it
   in two places: `SANITY_WEBHOOK_SECRET` env var on the backend, and the
   "Secret" field on the Sanity webhook.
4. **Configure the backend env vars** — locally in `backend/.env`, and in
   production via `infra/terraform.tfvars` and `terraform apply`:
   - `SANITY_PROJECT_ID`
   - `SANITY_DATASET`
   - `SANITY_API_TOKEN`
   - `SANITY_WEBHOOK_SECRET`
   - `SITE_URL` (for tracking links in emails)
5. **Create the Sanity webhook.** In the dashboard:
   - **Name**: `Order status email`
   - **URL**: `${site_url}/api/webhooks/sanity-order` (the CloudFront-fronted path, not the raw API Gateway URL)
   - **Dataset**: `production` (or wherever orders live after the PII fix)
   - **Trigger on**: `Update`
   - **Filter** (GROQ): `_type == "order" && delta::changedAny(status)` —
     crucial so non-status edits don't spam the customer
   - **HTTP method**: `POST`
   - **HTTP headers**: none required (signature is in a standard header
     Sanity adds automatically)
   - **Secret**: the value you generated in step 3
   - **Enable webhook**: yes
6. **Deploy the studio with the new schema** — `pnpm studio deploy` so Meryl's
   hosted studio includes the Order document type.

Once those are done, the full flow works end-to-end: customer submits → order
document created in Sanity → confirmation email with tracking link → Meryl
updates status in Studio → webhook fires → customer receives status email.

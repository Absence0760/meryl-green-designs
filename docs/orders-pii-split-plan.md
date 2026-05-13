# Orders PII split — proposal

**Status: Phase 0 in progress.** Days 1–6 are landed:

- Day 1 — Terraform scaffolding (empty DynamoDB table + Lambda IAM
  extension + `ORDERS_TABLE_NAME` env var). Applied.
- Day 2 — Backend wiring (`backend/src/dynamo.ts`,
  `backend/src/orders-store.ts` in dual-write mode, `routes/orders.ts`
  switched to the store).
- Day 3 — Admin routes (`backend/src/routes/admin.ts`) gated by
  `Authorization: Bearer <ADMIN_API_TOKEN>` and CORS-scoped to
  `STUDIO_ORIGINS`. New `orders-store.getOrderPii()` reads from DynamoDB
  so the Studio custom panels show the new source. PII-leak regression
  extended in `email.test.ts` to cover admin log lines.
- Day 4 — Studio custom components (`studio/components/orderPii.tsx`)
  with three field components (CustomerDetailsPanel, TrackingFields,
  InternalNotesField) wired into the order schema. **Local dev was
  reworked to use DynamoDB Local via docker-compose** (the plan's
  original design hit prod from dev; the operator preferred strict
  isolation). New `bin/dynamodb-local-up.sh` is idempotent and creates
  the local table matching prod's schema; `DYNAMODB_ENDPOINT` in
  `backend/.env` routes the SDK locally.
- Day 5 — Backfill script (`backend/src/scripts/backfill-orders.ts`,
  runs via `pnpm backfill:orders[:dry]`). Idempotent: reads every
  Sanity order doc, writes the rest via a **conditional Put**
  (`attribute_not_exists(orderRef)`) so it can't race the live
  dual-write Lambda. `--overwrite` switches to unconditional Put.
  Already-expired orders (where `createdAt + 365 days` is in the past)
  are skipped with a separate counter rather than written with a
  past TTL that DynamoDB would silently reap. Scrubbed orders (PII
  null in Sanity) backfill with empty-string sentinels. Lives at
  `src/scripts/` (slight deviation from the plan's `backend/scripts/`)
  so tsc covers it. Pure helpers (`piiItemFromSanity`, `isExpired`,
  `parseArgs`, `shouldRefusePromoting`) covered by
  `backfill-orders.test.ts`.
- Day 6 — Reverse-backfill script
  (`backend/src/scripts/restore-sanity-pii.ts`, runs via
  `pnpm restore:sanity-pii[:dry]`). Mirror image of the backfill:
  iterates from Sanity, does `GetItem` per row (no Scan needed),
  patches the Sanity doc with PII fields that are null/empty. Skips
  empty-string DynamoDB sentinels so a scrubbed row never overwrites
  real Sanity data, even under `--overwrite`. Idempotent: re-runs
  during steady-state Phase 0 are no-ops because Sanity still has the
  PII. Written and tested now so Phase 1 rollback is one command away.
  Pure helpers (`buildPatchFromPii`, `parseArgs`, `shouldRefuse`)
  covered by `restore-sanity-pii.test.ts`.

Both scripts now share safety gates beyond `--dry-run`:

- `--prod` — for the backfill, required when `DYNAMODB_ENDPOINT` is
  unset (the run would write to real AWS DynamoDB). For the restore,
  required for **every** wet run because the Sanity write always
  targets the single prod dataset regardless of where DynamoDB lives.
- `--yes` (restore only) — required alongside `--overwrite` so a
  mistyped command can't blow away Meryl's edits in Sanity.

The scripts opt into `ALLOW_REAL_AWS=1` after their gates clear; the
backend's `dynamo.ts` startup assertion refuses to construct a client
against real AWS without either that flag, `DYNAMODB_ENDPOINT`, or the
Lambda runtime env. A developer who runs `pnpm backend dev` with a
malformed `.env` fails fast instead of writing customer PII to the
prod table.

`payfast_sandbox` now defaults to `"true"` in `infra/variables.tf` —
to take real payments the operator must explicitly set it to `"false"`
in `terraform.tfvars.sops`. The Terraform variable has a `validation`
block requiring one of those two literal strings.

Dry-runs always bypass the script gates so previewing is cheap.

**Outstanding before prod deploy** (Day 7):

- Add `admin_api_token` and `studio_origins` to `infra/variables.tf`,
  the encrypted `infra/terraform.tfvars.sops`, and the Lambda env in
  `infra/lambda.tf`, then `terraform apply` again.
- The `production` GitHub Actions environment needs an `ADMIN_API_TOKEN`
  secret and a `PUBLIC_API_URL` variable so `deploy-studio.yml` can
  bake them into the Sanity Studio bundle.
- The IAM-narrowing change (Scan removed) requires a fresh
  `terraform apply` — the existing prod role still has Scan until that
  runs. The change is benign in isolation (no caller uses Scan yet).
- Local dev uses the values in `backend/.env` and `studio/.env`
  (templates updated).

Day 7 (prod deploy) and the cutover (Phase 1) still require explicit
go-ahead.

## Why this exists

Sanity's Free plan only allows **public** datasets. Today the `production`
dataset is private because it stores customer PII on order documents
(name, email, phone, shipping address, free-text notes). To stay on a paid
Sanity plan that supports private datasets costs **R285/month** (Growth, 1
seat).

A cheaper architecture is possible: keep Sanity for the half of the order
that isn't PII (reference, status, amount, payment metadata), and move the
PII to a private store on AWS (DynamoDB). The Sanity dataset becomes public,
the Free plan covers it, and the PII never leaves AWS.

The catch is that the implementation is the most complex of the three
options we've considered:

| Option | Monthly total | Build time | Trade-off |
|---|---|---|---|
| Pay Sanity Growth (status quo) | R360 | 0 | Simplest. PII shared with Sanity. |
| All orders out of Sanity, build a small AWS admin UI | R77 | ~5–8 days | Two admin UIs (one for content, one for orders). |
| **This proposal — split PII out, keep order index in Sanity** | **R77** | **~7–11 days** | One admin UI (Meryl stays in Sanity Studio) but two stores synced via the order reference. |

Monthly totals are all-in (Sanity + AWS + domain). Saving vs. status quo:
**~R283/month, ~R3,400/year** once amortised.

Pick this option only if preserving Meryl's single-UI workflow is more
valuable than the extra ~2 days of engineering and ongoing complexity.

## Goals

- Stay on the **Sanity Free plan** for the CMS + Studio workflow Meryl
  already uses for products, gallery, and testimonials.
- **No customer PII in Sanity.** Names, emails, phones, addresses, notes,
  tracking numbers, and tracking URLs live only in AWS DynamoDB,
  encrypted at rest with the AWS-managed `aws/dynamodb` key (see
  "Encryption" under Data model for why this isn't the SOPS CMK).
- Preserve Meryl's existing workflow on the **detail view**: open an
  order in Sanity Studio, see customer details, change status, add
  tracking, save. From her seat, the detail page looks the same as today.
- Preserve all customer-facing behaviour exactly: order form, PayFast
  redirect, ITN handling, confirmation and status emails, `/track` page.
- Keep the rollback path safe — at any point during migration, we can
  redeploy the previous backend + restore Sanity-only order docs.

**Accepted UX trade-off**: the Studio **list view** subtitle currently
reads `MG-260413-AB12 — Jane Smith`. With customer name no longer on the
Sanity document, the subtitle changes to `MG-260413-AB12 — Status:
shipped`. Meryl has to click into an order to know whose it is. This is
a real workflow regression for "find that order from Jane last week."
Bringing the name back to the list view would require a Sanity
structure-builder custom React column that does an N+1 fetch into our
admin API per row — fragile and slow. Left as a future enhancement; the
detail view is unchanged.

## Non-goals

- Not redesigning the order-status state machine (`pending_payment →
  payment_received → shipped → delivered → cancelled` stays).
- Not changing the payment integration (PayFast stays).
- Not building a separate admin UI outside Sanity Studio. (That's the
  "all-orders-out-of-Sanity" alternative, scoped separately.)
- Not introducing per-user accounts or role-based access in DynamoDB.
  Single-operator design — only Meryl uses the admin routes today. Auth
  is a shared bearer token; whoever holds it is treated as Meryl. Not a
  per-user identity system.

## Architecture overview

```
   ┌───────────────────────────┐                 ┌────────────────────────────┐
   │    Customer browser       │                 │ Meryl in Sanity Studio     │
   │                           │                 │  • native Sanity fields    │
   │  POST /orders             │                 │  • <CustomerDetailsPanel>  │
   │  GET  /orders/:ref?email= │                 │  • <TrackingFields>        │
   └─────────────┬─────────────┘                 │  • <InternalNotesField>    │
                 │                               └──┬──────────────────────┬──┘
                 │                                  │                      │
                 │                  Studio writes   │                      │ PATCH
                 │                  native fields   │                      │ /admin/
                 │                                  ▼                      │ orders
                 │                  ┌───────────────────────────────┐      │
                 │                  │ Sanity dataset  (PUBLIC)      │      │
                 │                  │                               │      │
                 │                  │ Order doc:                    │      │
                 │                  │   - orderRef                  │      │
                 │                  │   - status                    │      │
                 │                  │   - amountZar                 │      │
                 │                  │   - paymentMethod             │      │
                 │                  │   - paymentId                 │      │
                 │                  │   - _createdAt                │      │
                 │                  └──┬─────────────────────────┬──┘      │
                 │                     │                         ▲         │
                 │  POST /webhooks/    │                         │         │
                 │  sanity-order       │                         │ server  │
                 │  (on doc mutation)  │                         │ writes  │
                 ▼                     ▼                         │         ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                      Backend (Hono on Lambda)                            │
   │                                                                          │
   │   ┌────────────────────────────────────────────────────────────────┐     │
   │   │ orders-store.ts (NEW)                                          │     │
   │   │   • createOrder()         • updateStatus()                     │     │
   │   │   • getOrderByRef()       • updateTracking()                   │     │
   │   │   • updateInternalNotes()                                      │     │
   │   └───────────────────────────────────┬────────────────────────────┘     │
   └───────────────────────────────────────┼──────────────────────────────────┘
                                           │
                              reads/writes all PII fields
                                           │
                                           ▼
                  ┌──────────────────────────────────────────────────┐
                  │ DynamoDB  (PRIVATE, af-south-1, SSE-KMS)         │
                  │                                                  │
                  │ Item keyed by orderRef:                          │
                  │   - customerName / customerEmail / customerPhone │
                  │   - shippingAddress / items / customerNotes      │
                  │   - trackingNumber / trackingUrl / shippingCarrier│
                  │   - internalNotes                                │
                  │   - createdAt                                    │
                  │   - ttl  ← TTL key (auto-deleted at              │
                  │            createdAt + 365 days)                 │
                  └──────────────────────────────────────────────────┘
```

**How to read it.** The single Sanity-dataset box has three arrows in/out:
Studio writes (Meryl editing native fields), server writes (Backend on
POST /orders + status changes), and a webhook out (fires when the doc
mutates, regardless of who wrote it). The Backend's PII reads/writes go
to DynamoDB only.

The order reference (`MG-260413-AB12`) is the join key. It's generated
server-side, written to both stores at order creation, and used in every
URL the customer ever sees (status emails, tracking page).

## Data model

### Sanity (public dataset)

`studio/schemas/order.ts` — keep these fields, remove the rest:

| Field | Type | Notes |
|---|---|---|
| `orderRef` | string | Generated server-side. Join key. Sanity has no explicit indexing primitive; GROQ queries on `orderRef` are fine at our volume. |
| `status` | string enum | `pending_payment` / `payment_received` / `shipped` / `delivered` / `cancelled`. |
| `amountZar` | number | Total in Rands. |
| `paymentMethod` | string enum | `payfast` for v1. |
| `paymentId` | string, optional | PayFast transaction id, set on ITN. |
| `_createdAt`, `_updatedAt` | built-in | Sanity timestamps. |

**Removed from Sanity** (move to DynamoDB):
`customerName`, `customerEmail`, `customerPhone`, `shippingAddress`,
`items`, `customerNotes`, `trackingNumber`, `trackingUrl`,
`shippingCarrier`, `internalNotes`.

### DynamoDB (private, `af-south-1`)

Table: `meryl-green-designs-orders` (provisioned in Terraform).

| Attribute | Type | Notes |
|---|---|---|
| `orderRef` | S | Partition key. |
| `customerName` | S | |
| `customerEmail` | S | Used by `/track` for email-verified lookup. |
| `customerPhone` | S, nullable | |
| `shippingAddress` | S | |
| `items` | S, free text | Free-text description; can contain identifying context, so private. |
| `customerNotes` | S, nullable | |
| `trackingNumber` | S, nullable | Most courier tracking URLs reveal recipient info, so this and `trackingUrl` must be private. |
| `trackingUrl` | S, nullable | |
| `shippingCarrier` | S, nullable | |
| `internalNotes` | S, nullable | Free text from Meryl. |
| `createdAt` | S, ISO 8601 | Mirrors Sanity's `_createdAt` for cleanup math. |
| `ttl` | N, Unix epoch seconds | `createdAt + 365 days`. DynamoDB auto-deletes when reached. Replaces today's PII-cleanup scheduled job. |

**Indexes**: none for v1. `GetItem` by `orderRef` is the only access pattern.
If volume grows and Meryl wants admin-side filtering by status, the status
lives on Sanity, not DynamoDB — so any "show me all shipped orders" query
goes through Sanity, never DynamoDB.

**Encryption**: enable SSE-KMS with the AWS-managed key `aws/dynamodb`.

Why not the project SOPS CMK? `bin/sops-init.sh`'s key policy only grants
access to the SOPS workflow's IAM principals — the DynamoDB service
principal isn't on it. Pointing the table at the SOPS CMK would create
the table fine but every write would fail with `KMSKeyAccessDeniedException`.
Fixable by extending the SOPS key policy, but the simpler answer is to
let DynamoDB use its AWS-managed key, which is free, transparent to the
Lambda, and avoids cross-coupling the SOPS trust boundary with the
DynamoDB trust boundary. If you later want a customer-managed key for
auditing/rotation reasons, create a dedicated DynamoDB CMK rather than
reusing the SOPS one.

**Point-in-time recovery**: enabled. 35-day rolling window. Cheap insurance
for the PII bucket.

## Data flows

### POST /orders — order creation

The write order is **phase-dependent** because the source-of-truth
inverts between Phase 0 and Phase 1.

**Phase 0 (dual-write, Sanity is source of truth):**

```
1. Backend validates request body (existing logic)
2. Backend computes amountZar from Sanity products (existing logic)
3. Backend generates orderRef
4. Backend writes Sanity create() with the full doc (incl. PII fields,
   since the schema still carries them)
5. Backend writes DynamoDB PutItem with PII fields (shadow)
   • ConditionExpression: attribute_not_exists(orderRef) — duplicate guard
6. If step 5 fails: log and continue — the order is valid because
   Sanity still holds every field. The reconciler cron flags rows
   missing from DynamoDB so they can be backfilled.
7. Backend sends owner notification email (existing logic)
8. Backend returns PayFast redirect form data
```

**Phase 1 (split-write, DynamoDB holds PII):**

```
1–3. Same as Phase 0.
4. Backend writes DynamoDB PutItem with PII fields
   • ConditionExpression: attribute_not_exists(orderRef) — duplicate guard
5. Backend writes Sanity create() with **non-PII fields only**
6. If step 5 fails:
   • Compensating delete on DynamoDB (best-effort)
   • Return 500 to the client
7–8. Same as Phase 0.
```

**Failure modes** (Phase 0):

- Step 4 fails → return 500, nothing created.
- Step 5 (shadow) fails → order still succeeds. Reconciler cron flags
  the gap; manual backfill closes it.

**Failure modes** (Phase 1):

- Step 4 fails → return 500, nothing created.
- Step 5 fails after step 4 succeeded → compensating delete in step 6.
- Compensating delete also fails → orphaned PII row. The daily
  reconciler cron flags it; operator runbook is "inspect via the
  DynamoDB console, confirm it's an orphan (no matching Sanity doc),
  `DeleteItem` it." We don't auto-delete because the case is rare and
  a bad auto-delete is worse than a slow manual one. If volume grows
  enough that orphans become a steady stream, auto-delete after 7
  days of orphan status with a CloudWatch metric.

### POST /webhooks/payfast-itn — payment confirmed

```
1. Backend verifies PayFast MD5 signature over the raw body (existing)
2. Backend reads the Sanity order by orderRef
3. Backend cross-checks amount_gross vs the Sanity order's amountZar
4. Backend mutates the Sanity order:
   • status: pending_payment → payment_received
   • paymentId: set from ITN
5. Backend reads customerEmail from DynamoDB by orderRef
6. Backend sends customer confirmation email via Resend
7. Backend returns 200 to PayFast (always, after sig check)
```

If step 5 fails, log + CloudWatch alarm; don't 500 to PayFast (avoid
retry storms). A manual replay path covers this — see Operational
considerations below.

### Meryl marks an order as shipped in Sanity Studio

```
1. Meryl opens order MG-260413-AB12 in Studio
   • Native Sanity fields render directly from the public dataset
   • <CustomerDetailsPanel> fetches GET /admin/orders/:ref → DynamoDB
   • <TrackingFields> fetches the same; renders editable inputs
2. Meryl types a tracking number into <TrackingFields>
   • On blur: component PATCHes /admin/orders/:ref/tracking → DynamoDB
3. Meryl changes status from "payment_received" to "shipped"
   • Native Sanity field → saved into the public dataset
4. Sanity fires POST /webhooks/sanity-order with the new status
5. Backend webhook handler:
   a. Verifies HMAC-SHA256 over the raw body (existing pattern)
   b. Extracts orderRef and new status from the payload
   c. Reads customerEmail and tracking info from DynamoDB
   d. Sends the customer status email via Resend
   e. Returns 200
```

### Meryl edits tracking + status in one Studio session

The native Sanity field (`status`) and custom inputs (`trackingNumber`,
`shippingCarrier`, `trackingUrl`) live in the same form but persist
independently:

- Custom inputs save on blur via `PATCH /admin/orders/:ref/tracking`. (The plan originally called for a 300ms keystroke debounce; the implementation in `orderPii.tsx` is simpler — one PATCH per blur. Add debouncing later if Meryl reports the blur-save is laggy.)
- The native `status` field saves when Meryl hits Studio's Publish button.

If she types a tracking number and then changes status to `shipped`
without losing focus first, the order of writes is:
1. Status save fires Sanity's mutation → publish; this completes when
   Studio shows the saved state.
2. Tracking save fires on Publish-blur → DynamoDB write.
3. Sanity webhook arrives at the backend; backend reads DynamoDB
   (tracking may or may not yet be there).
4. If tracking arrived in time, the status email includes it; if not,
   it goes out without tracking and Meryl re-saves status to re-fire.

In practice this race is rare because Meryl always hits Publish last,
which blurs the tracking input first. Worth a note for the implementer,
not a blocker.

**Re-firing the webhook**: if Meryl needs to re-send a status email (e.g.,
because she added tracking after the initial "shipped" notification), she
can't just re-save the same status — Sanity de-duplicates no-op mutations
and the webhook won't fire. To force a re-fire she'd need to toggle
status to a different value and back (e.g., `shipped` → `payment_received`
→ `shipped`), or open the Sanity dashboard's webhook log and trigger a
manual replay. Worth surfacing in Meryl's operator runbook.

### Order cancellation

`status: cancelled` is a normal transition through the same Sanity-edit
path above. The DynamoDB row stays until its TTL (`createdAt + 365
days`) — same as for fulfilled orders. No special-case cleanup is
needed because PII retention is uniform across statuses.

If Meryl wants to delete an order outright (e.g. a duplicate or test
order), she deletes the Sanity document and the reconciler cron flags
the now-orphaned DynamoDB row on its next run for manual deletion. We
don't auto-delete from DynamoDB on Sanity-side delete events because
that's an exfiltration risk if the Sanity webhook is ever spoofed.

### GET /orders/:ref — customer order lookup at `/track`

```
1. Frontend submits orderRef + email
2. Backend reads the DynamoDB item by orderRef
3. Backend constant-time compares the submitted email with stored email
4. If mismatch: 404 (no enumeration; existing behaviour)
5. If match:
   • Backend reads status, amountZar from Sanity
   • Backend reads tracking info from DynamoDB
   • Backend returns a sanitised subset (no phone, no internal notes,
     no address — same as today)
6. Frontend renders status card
```

## Sanity Studio implementation

### Schema (`studio/schemas/order.ts`)

```ts
import { defineField, defineType } from 'sanity';
import {
  CustomerDetailsPanel,
  TrackingFields,
  InternalNotesField,
} from '../components/orderPii';

export const order = defineType({
  name: 'order',
  type: 'document',
  fields: [
    defineField({ name: 'orderRef',      type: 'string', readOnly: true }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: [/* same five values as today */], layout: 'radio' },
      initialValue: 'pending_payment',
    }),
    defineField({ name: 'amountZar',     type: 'number', readOnly: true }),
    defineField({ name: 'paymentMethod', type: 'string', readOnly: true }),
    defineField({ name: 'paymentId',     type: 'string', readOnly: true }),

    // PII panels — custom components, never store anything in Sanity
    defineField({
      name: 'customerDetails',
      type: 'string',
      components: { field: CustomerDetailsPanel },
    }),
    defineField({
      name: 'tracking',
      type: 'string',
      components: { field: TrackingFields },
    }),
    defineField({
      name: 'internalNotes',
      type: 'string',
      components: { field: InternalNotesField },
    }),
  ],
  preview: {
    select: { title: 'orderRef', status: 'status' },
    prepare({ title, status }) {
      return { title: title ?? 'New order', subtitle: `Status: ${status}` };
    },
  },
});
```

The preview's subtitle drops `customerName` (it's not on the Sanity doc
anymore). If we want the name back in the preview, the list view'd need a
custom React component that does an N+1 fetch — probably not worth it.

### Custom components (`studio/components/orderPii.tsx`)

Three components, all using `@sanity/ui` so they match Studio styling:

- `<CustomerDetailsPanel>` — read-only. On mount, `useFormValue(['orderRef'])`
  + `fetch GET /admin/orders/:ref`, renders the fields in a styled `<Card>`.
  Handles loading + error states.
- `<TrackingFields>` — read + write. Fetches same as above; renders three
  text inputs (`trackingNumber`, `trackingUrl`, `shippingCarrier`); on blur,
  `PATCH /admin/orders/:ref/tracking` with the changed values. Save fires
  on field blur (one request per edited field, not per keystroke).
- `<InternalNotesField>` — read + write. Single textarea, same save pattern.

### Admin auth

Single static token, baked into the Studio bundle at build time:

- New env var: `SANITY_STUDIO_ADMIN_TOKEN` in `studio/.env` (not secret —
  Studio is published to a known subdomain, CORS-locked).
- Backend admin routes check `Authorization: Bearer <token>` against
  `ADMIN_API_TOKEN` in `backend/.env.sops`.
- CORS restricted to the Studio's hosted origin
  (`<project>.sanity.studio`).
- Rotation: update both env vars, redeploy Studio + Lambda.
- **Trust boundary**: `ADMIN_API_TOKEN` lives in `backend/.env.sops`,
  which means anyone with `kms:Decrypt` on the SOPS key can read it —
  exactly the same boundary as for `SANITY_API_TOKEN`, `RESEND_API_KEY`,
  and `PAYFAST_PASSPHRASE`. Not a new exposure, but worth flagging
  because the admin token is the only secret in this set that grants
  read access to all customer PII at once.

This is **the weakest auth in the stack** — if the token leaks, an attacker
can read all PII via the admin API. Mitigations:

- Studio runs on a known domain Meryl alone uses.
- Token is at least 256-bit entropy (`openssl rand -hex 32`).
- CloudWatch alarm on admin 401/403 spikes — surfaces brute-force attempts.
- Rotate the token every 90 days as a default discipline.

Future hardening (out of scope for v1, in priority order):
1. Verify Meryl's Sanity auth token against Sanity's userinfo endpoint on
   each admin call.
2. Move to AWS Cognito-issued JWTs.
3. Per-action audit log (who did what, when).

## Backend implementation

### New files

- `backend/src/dynamo.ts` — DynamoDB client setup (mirrors `sanity.ts` shape).
- `backend/src/orders-store.ts` — split-store operations. Public functions:
  `createOrder()`, `getOrderByRef()`, `updateOrderStatus()`,
  `updateOrderTracking()`, `updateOrderInternalNotes()`. Internally splits
  reads/writes across Sanity and DynamoDB.
- `backend/src/routes/admin.ts` — Hono sub-app for admin endpoints. Mounted
  at `/admin/orders`.
- `backend/src/middleware/admin-auth.ts` — bearer-token check; rejects with
  401.
- `backend/src/__tests__/admin.test.ts` — covers admin auth, GET, PATCH
  flows.
- `backend/src/__tests__/orders-store.test.ts` — split-store unit tests
  with mocked Sanity and DynamoDB clients.
- `backend/src/scripts/backfill-orders.ts` — one-shot backfill for Phase 0.
  Reads all Sanity order docs, writes corresponding DynamoDB rows.
  Idempotent.
- `backend/src/scripts/scrub-sanity-pii.ts` — one-shot Phase 1 step.
  Unsets PII fields on every existing Sanity order doc.
- `backend/src/scripts/restore-sanity-pii.ts` — rollback-only. Re-imports
  PII from DynamoDB back into Sanity if Phase 1 has to be reversed.
  Written and tested in Phase 0 so it's available when needed.

### Modified files

- `backend/src/routes/orders.ts` (POST `/orders`) — call
  `ordersStore.createOrder()` instead of `createOrder()` directly.
- `backend/src/routes/order-lookup.ts` (GET `/orders/:ref`) — read from
  `ordersStore.getOrderByRef()`, which joins Sanity + DynamoDB.
- `backend/src/routes/payfast-itn.ts` — call `ordersStore.updateOrderStatus()`
  for the status mutation; read customer email via `ordersStore`.
- `backend/src/routes/sanity-webhook.ts` — read customer email and tracking
  info from `ordersStore` instead of from the webhook payload.
- `backend/src/sanity.ts` — remove PII fields from the `SanityOrder` type
  and the `createOrder()` write payload. Keep schema reads for status flow.
- `backend/src/app.ts` — mount the new `/admin` router.
- `backend/src/__tests__/orders.test.ts` — update assertions to expect the
  split-store behaviour; mock both stores.
- `backend/src/__tests__/payfast-itn.test.ts` — same.
- `backend/src/__tests__/sanity-webhook.test.ts` — same.
- `backend/src/__tests__/email.test.ts` — extend the existing
  banking-details-in-email regression test so it also fails if any PII
  field name appears in admin route log lines (defensive check that the
  new `/admin/orders` handlers never log PII values).

### Files to delete

The Sanity-side PII cleanup is replaced by DynamoDB TTL. Once Phase 1 is
stable, remove **all** of the following — they're a coherent set:

- `backend/src/pii-cleanup.ts` and `backend/src/__tests__/pii-cleanup.test.ts`
  — the cleanup module and its tests.
- The `runPiiCleanup` import + dispatch branch in `backend/src/lambda.ts`
  (the Lambda itself stays — it serves HTTP traffic; only the EventBridge
  dispatch arm is removed).
- The reference comment in `backend/src/sanity.ts:269`
  (`// PII retention — see backend/src/pii-cleanup.ts and docs/security.md`).
  Check whether `pii-cleanup.ts` pulls any helpers out of `sanity.ts`
  that nothing else uses afterward; if so, remove those too. Don't
  delete anything in `sanity.ts` that the main HTTP paths still need.
- `infra/pii_cleanup.tf` (the `aws_cloudwatch_event_rule`,
  `aws_cloudwatch_event_target`, and `aws_lambda_permission` resources).
- The pii-cleanup reference comment in `infra/lambda.tf` (around line 68).
- Update `docs/security.md § PII retention (POPIA Section 14)` to
  describe the new DynamoDB-TTL mechanism.

### Tests

Use `aws-sdk-client-mock` for the DynamoDB client. Tests stay offline
(matching the existing pattern that mocks Sanity + Resend). Coverage goals:

- Round-trip: create → read → update status → read → update tracking → read.
- Failure modes: DynamoDB write succeeds but Sanity create fails →
  compensating delete fires.
- Write-order invariant: orders-store unit test asserts DynamoDB write
  call precedes Sanity create call (defends the failure-modes table).
- Auth: admin endpoints return 401 without a token, 401 with a wrong token,
  200 with the right token.
- PII safety: assert that no Sanity write payload contains any PII field.
- Status-email integration: Sanity webhook payload → DynamoDB email
  lookup → mocked Resend `sendEmail` call carries the right `to:` +
  template + tracking values.
- `/track` join: `GET /orders/:ref?email=` does DynamoDB read +
  constant-time email compare + Sanity status read + returns sanitised
  subset (no phone, no address, no internal notes).
- Admin log regression: extension of `email.test.ts`'s
  banking-details-in-email check — fails if any PII field name or value
  appears in admin route log lines.

### Infrastructure (`infra/`)

New Terraform resources:

```hcl
# infra/dynamodb.tf (new)
#
# SSE-KMS uses the AWS-managed aws/dynamodb key. We deliberately do NOT
# reuse the SOPS CMK — its key policy doesn't grant the DynamoDB service
# principal access, and extending it cross-couples two unrelated trust
# boundaries. The AWS-managed key is free, encrypts at rest, and the
# Lambda needs no extra kms:* permissions to interact with the table.
resource "aws_dynamodb_table" "orders" {
  name         = "meryl-green-designs-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderRef"

  attribute {
    name = "orderRef"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
    # kms_key_arn omitted → uses the AWS-managed aws/dynamodb key.
  }
}
```

The provider-level `default_tags` in `main.tf` covers Project / ManagedBy
/ Environment for every resource — no per-resource `tags` block is
needed here. The actual `infra/dynamodb.tf` matches this shape.

IAM: extend the Lambda execution role with `dynamodb:GetItem`, `PutItem`,
`UpdateItem`, `DeleteItem`. `Scan` is **not** granted in Phase 0
because nothing reads via Scan; it'll be added back in the same change
that introduces the reconciler cron (Days 10–11). Keep the existing
Sanity permissions.

No additional KMS permissions are needed on the Lambda role — SSE-KMS
with the AWS-managed `aws/dynamodb` key is transparent to callers.

The IAM principal running `terraform apply` needs whatever permissions
it already has to create DynamoDB tables; nothing new for this change.

New env var on the Lambda: `ORDERS_TABLE_NAME`, sourced from the Terraform
output.

## Migration plan

### Phase 0 — pre-cutover (no behaviour change)

Goal: get DynamoDB + admin routes deployed in a "shadow" mode that doesn't
yet affect production.

1. Terraform `apply` to create the DynamoDB table and IAM updates.
2. Build the backend in **dual-write mode**: on every successful Sanity
   write, also write to DynamoDB. Reads still come from Sanity (source of
   truth).
3. Deploy backend.
4. Deploy Studio with the new custom components, but **don't** remove the
   PII fields from the Sanity schema yet. Components fetch from
   `/admin/orders/:ref`; if DynamoDB has the row (from dual-write), render
   it; if not, fall back to a "loading…" state (fine because the native
   Sanity PII fields above the custom panel still render).

   **User-facing note for this phase**: during Phase 0, Meryl will see
   customer details **twice** on each order page — once in the native
   Sanity fields at the top of the form, once in the new custom panel
   below. This is intentional duplication for validation. Phase 1
   removes the native PII fields and leaves only the custom panel. Tell
   Meryl about this *before* she opens an order, otherwise the doubled
   view looks like a bug.
5. Run a **backfill script** (`backend/src/scripts/backfill-orders.ts`):
   - Fetch all existing Sanity order docs via the admin token.
   - For each, write a DynamoDB row with the PII fields.
   - Idempotent — re-runnable.
6. Validate: open ~5 orders in Studio. Confirm custom panels render the
   right data. Confirm CloudWatch logs show no errors.

This phase is **code-reversible**. Reverting the Lambda deploy stops
the dual-write at any time with zero customer impact. The DynamoDB rows
accumulated during the dual-write window stay where they are — harmless
because nothing reads from them yet, and a small cleanup script can
purge them if you want a clean slate before retrying.

### Phase 1 — cutover

Goal: flip production to the new architecture in a single short window.

**Deploy order matters here** — do the Studio first, then the backend,
then the scrub. Reversing this leaves a window where new orders have no
PII fields in Sanity but the old Studio schema still tries to render
them, producing blank "customerName" displays for the duration of the
window.

1. Deploy Studio with the **new schema** (PII fields removed; custom
   panels remain). Existing orders still have PII on the Sanity doc;
   the Studio just stops showing it natively, deferring to the custom
   panel below.
2. Deploy backend in **split-write mode**: writes to PII fields go only
   to DynamoDB, writes to non-PII fields go only to Sanity. Reads join
   both stores via `orders-store.ts`.
3. Run a **scrub script** (`backend/src/scripts/scrub-sanity-pii.ts`): for each
   existing Sanity order doc, write a patch that unsets the PII fields.
   Sanity history retains the old values for ~30 days unless we explicitly
   purge history.
4. Decide on the Sanity history strategy:
   - **Default**: explicitly purge history on the scrubbed order docs via
     the Sanity HTTP API's history endpoint. Lets Phase 2 begin once the
     2-week observation window has elapsed.
   - **Lazy alternative**: skip the purge and wait ~30 days for Sanity to
     roll history off naturally. Phase 2 then waits the full 30 days.
5. Validate:
   - Every existing order opens correctly in Studio.
   - Customer `/track` lookups work.
   - ITN-style webhook replay against a known order produces a correct
     status email.
   - **Sanity webhook still fires post-scrub.** The webhook is
     configured in the Sanity dashboard (not in our code). If its
     filter references a now-removed PII field, e.g.
     `_type == "order" && defined(customerEmail)`, it stops firing
     after the scrub. Open a test order in Studio, bump status,
     confirm the webhook attempt appears in Sanity's webhook log and
     the backend Lambda received it.

This is the **least reversible** step — once history is purged (or rolls
off), the PII has fully left Sanity. Keep dual-write builds available for
at least 2 weeks before the scrub, in case rollback is needed.

**Phase 2 timing**: at minimum 14 days of clean metrics post-cutover. If
choosing the lazy history-rollover path in step 4, also wait until 30
days have elapsed since the scrub before initiating Phase 2 — Sanity's
plan downgrade can't happen while history still holds private data.

### Phase 2 — downgrade Sanity

Goal: stop paying for Growth.

1. Wait at least 14 calendar days past Phase 1 cutover with green
   CloudWatch metrics. If you took the lazy history-rollover path in
   Phase 1, also wait until 30 days have elapsed since the scrub.
2. In the Sanity dashboard, change the dataset visibility from Private to
   Public — **while still on the Growth plan**. Growth supports both
   visibilities, so this is reversible; Free supports only public, so
   you can't downgrade first. The order matters.
3. Smoke-test: open the site, confirm everything still loads (frontend,
   `/track`, `POST /orders`, ITN-style replay). Open Studio, confirm
   orders still appear.
4. Downgrade plan from Growth to Free. Note: Sanity's downgrade UI
   requires confirmation and may end the current Growth billing cycle
   immediately rather than refunding prorated time — check the dashboard
   text before clicking through.

If anything breaks at step 3, revert visibility to Private (still on Growth
within the same billing cycle, no incremental cost), debug, and retry.

### Rollback

The dual-write deploy from Phase 0 is the rollback anchor. If anything
breaks post-cutover within the 2-week buffer window:

1. Revert the Lambda to the Phase-0 dual-write build.
2. Run `backend/src/scripts/restore-sanity-pii.ts` to re-import PII from
   DynamoDB back into Sanity. The script is written and tested in
   Phase 0 specifically so it's available when needed.
3. Sanity history is now ahead of where it was; live with the noise or
   purge as desired.
4. Sanity plan stays on Growth (we never downgraded).

## Security implications

### POPIA improvements

- **Fewer responsible-party processors.** Sanity moves from "stores PII" to
  "stores opaque references." Updates required in:
  - `frontend/src/routes/privacy/+page.svelte` — the "Who we share it
    with" section currently lists Sanity as receiving full order PII;
    that line moves to AWS DynamoDB.
  - `docs/security.md § Risk 1` (impersonation) — references to where
    customer details live.
  - `docs/security.md § PII retention (POPIA Section 14)` — replace
    the scheduled-cleanup-job description with the DynamoDB TTL story.
  - `frontend/CLAUDE.md` — the hard rule "No direct Sanity document
    queries from the frontend. The dataset is private; the backend
    brokers all reads." Keep the rule (backend brokerage still gives us
    caching, schema validation, a single rate-limit/observability point)
    but rewrite the rationale — "the dataset is private" becomes false
    after Phase 2.
- **Tighter retention enforcement.** DynamoDB TTL is a built-in feature
  configured per-row; PII is auto-deleted at `createdAt + 365 days` without
  a scheduled job to maintain. Replaces the cleanup pattern in
  `docs/security.md § PII retention`.
- **Smaller cross-border footprint.** PII no longer travels to Sanity's
  hosting region. The remaining cross-border processors (PayFast — SA;
  Resend — US; AWS — `af-south-1` for everything we control) are all
  documented in the existing policy.

### New failure modes

| Failure | Phase | Impact | Mitigation |
|---|---|---|---|
| `POST /orders` Sanity write succeeds, DynamoDB write fails | 0 | Order valid (Sanity holds full doc); DynamoDB row missing | Reconciler cron flags the gap; manual backfill |
| `POST /orders` DynamoDB write succeeds, Sanity write fails | 1 | Orphaned PII row in DynamoDB | Compensating delete in handler; reconciler flags survivors |
| `POST /orders` Sanity write succeeds, DynamoDB write fails | 1 | Order exists in Studio with no customer details panel data | Cannot occur by construction — Phase 1 will write DynamoDB first. A Phase 1 orders-store unit test will assert the call order and the compensating-delete behaviour; today's tests cover Phase 0 only (Sanity-first call order). |
| ITN status update: Sanity write succeeds, DynamoDB email read fails | 0/1 | Status updates but customer email doesn't fire | CloudWatch alarm; manual replay endpoint |
| Sanity webhook arrives but DynamoDB row TTL'd already (very old order) | 1 | Status email handler 404s on email lookup | Soft-fail and log; old orders shouldn't be status-changing anyway |
| Admin token leaks | 0/1 | Attacker reads all PII | CloudWatch on admin 401/403; rotate quarterly; consider Sanity JWT verification as a v2 hardening |

### Reconciler cron

**Implementation**: the same backend Lambda, with a new dispatch branch
in `backend/src/lambda.ts` that calls `runReconciler()` from a new
`backend/src/reconciler.ts` (mirrors the existing pii-cleanup pattern
that lives in `backend/src/pii-cleanup.ts` and is dispatched from the
Lambda's main handler). Schedule via a new `aws_cloudwatch_event_rule`
in `infra/reconciler.tf` — daily, e.g. `cron(0 5 * * ? *)` (one hour
offset from any other scheduled jobs to avoid cold-start clashes).

**What it does**:

1. List all Sanity order docs — uses the existing `SANITY_API_TOKEN`
   env var (read-only operations work with the current token; no new
   secret needed).
2. List all DynamoDB orders — single `Scan`, authorised by the Lambda
   execution role (same IAM policy that grants `GetItem`/`PutItem` etc.).
3. Emit metrics: orphans (Dynamo without Sanity), gaps (Sanity without
   Dynamo), TTL-imminent rows.
4. CloudWatch alarm on any orphans or gaps for >24 hours.

Scan cost at current volume (<1000 orders): single-digit cents per
month. If volume grows past ~10k orders, switch to a delta approach
keyed on `_updatedAt`/`createdAt` so the cron stays linear in change
rate rather than table size.

## Operational considerations

### Monitoring

- CloudWatch alarm on `/admin/orders/*` 5xx count: **≥3 errors in any
  24-hour window**. Rate-based alarms don't work at this volume — Meryl
  hits the admin API a handful of times per day, so a single 500 from a
  cold-start blip is 25% of traffic for that hour. Absolute count over
  a longer window matches the signal-to-noise. Same shape as the
  pii-cleanup failure alarm in `infra/pii_cleanup.tf`.
- CloudWatch alarm on reconciler-detected orphans/gaps.
- CloudWatch logs: admin endpoints log `orderRef + action + result`;
  **never log PII field values** (matches the existing convention; the
  email regression test should be extended to cover admin log lines).

### Backup / disaster recovery

- DynamoDB point-in-time recovery: 35 days, automatic.
- Sanity has its own backup policy (out of our control on Free).
- For "lost everything" DR: PIT-restore DynamoDB; recreate Sanity dataset
  from CI deploys (Studio re-publishes the schema on every release).

### Cost

Monthly all-in for this proposal at current scale (~50 orders/month):

| Item | Today (Sanity Growth) | After this proposal |
|---|---|---|
| Sanity | R285 (Growth, 1 seat) | R0 (Free) |
| AWS Lambda, S3, CloudFront, API Gateway, Route53, KMS | ~R55 | ~R55 |
| DynamoDB on-demand (orders table) | — | ~R2 |
| Reconciler Lambda + Scan (daily) | — | <R1 |
| Domain (amortised) | R20 | R20 |
| Resend (free tier) | R0 | R0 |
| **Total** | **~R360/month** | **~R77/month** |

**Saving: ~R283/month, ~R3,400/year** once amortised. Break-even on the
~7–11 days build cost: ~3–4 years if dev time is valued at zero; ~never
at any reasonable hourly rate. **The real driver for this change is
reduced PII surface area on third-party SaaS, not the money.**

## Risks and open questions

Forward-looking only — architectural rationale for the data-model splits
lives in the **Data model** section.

- **Custom Sanity Studio component maintenance**: Studio version bumps
  occasionally break custom components. We accept this maintenance load.
  Add the Studio version to the watched-dependencies set in `deployment.md`.
- **Reconciler false positives during deploys**: a deploy that completes
  the DynamoDB write but is killed before the Sanity write could trigger
  the orphan alarm. The 24-hour alarm window should swallow normal deploy
  races, but tune if alarms turn out noisy.
- **Studio bundle leakage of the admin token**: the static admin token
  is baked into the published Studio bundle. The bundle URL is known
  (`<project>.sanity.studio`) and downloadable by anyone who can guess
  the project subdomain. CORS limits *origin* but doesn't prevent a
  determined attacker from copying the token out of the JS. The 90-day
  rotation discipline and CloudWatch 401/403 alarms are the v1
  mitigations; v2 hardening (Sanity JWT verification, AWS Cognito) is
  listed under Admin auth.
- **Sanity Free plan headroom**: at current scale we use 1 of 2 datasets,
  1 of 20 seats, 4 of unlimited content types. If the project ever needs
  a *private* dataset (e.g. staging content separate from prod, or any
  PII reappearing in Sanity for a new feature), Free no longer fits and
  we're back on Growth.
- **Operator deletes a Sanity order doc without the DynamoDB row**:
  documented above (reconciler flags the orphan; manual cleanup). Worth
  monitoring at first to make sure the runbook is clear.

## Implementation sequencing (estimated 7–11 working days + 14 calendar days observation)

This project is **single-environment** (prod only — no staging Lambda,
no staging DynamoDB, no staging Sanity dataset). The plan stays safe
without a staging env because every code change is feature-flagged or
shadow-mode until Phase 1: the DynamoDB table sits empty until the
dual-write deploy reads/writes it, the admin routes are inert until
Studio calls them, and Sanity stays the source of truth throughout
Phase 0. Local testing runs `pnpm backend dev` + `pnpm studio dev`
against prod Sanity + prod DynamoDB.

| Day | Type | Work |
|---|---|---|
| 1 | work | Terraform: `aws_dynamodb_table.orders` + IAM extension + `ORDERS_TABLE_NAME` env var. `terraform apply` against prod — creates an empty table that nothing reads or writes yet, so the apply is zero-risk. |
| 2 | work | `backend/src/dynamo.ts`, `orders-store.ts` (dual-write mode). Unit tests with mocks. |
| 3 | work | Admin routes + auth middleware. Tests. Wire into `app.ts`. Extend the banking-details regression in `email.test.ts` to cover admin log lines. |
| 4 | work | Sanity Studio custom components. Local Studio testing — `pnpm studio dev` against `pnpm backend dev` (which talks to the prod DynamoDB table via the dev IAM role). |
| 5 | work | Backfill script. Dry-run locally — reads from prod Sanity, writes to a scratch DynamoDB attribute prefix (e.g. `dryrun_orderRef`) or to the real table since the script is idempotent. |
| 6 | work | Reverse-backfill (`restore-sanity-pii.ts`) + test locally — written now so it's available if Phase 1 has to roll back. Same single-env testing approach as the backfill. |
| 7 | work | Pre-cutover deploy to prod (Phase 0 dual-write). Run the real backfill. Validate dual-write + Studio render against existing orders. |
| 8 | work | Cutover deploys to prod (Studio first, then backend), split-write mode, scrub script. Delete the full pii-cleanup set — see § Files to delete (5 items: module, test, lambda.ts dispatch branch, infra/pii_cleanup.tf, plus comments in sanity.ts:269 and lambda.tf:68). |
| 9 | work | Update `docs/orders-and-tracking.md`, `docs/security.md` (§ Risk 1, § PII retention), `docs/architecture.md`, `frontend/CLAUDE.md` (rationale rewrite), and the `/privacy` page. |
| 10–11 | work | Buffer for issues + reconciler cron Lambda + alarms. |
| +14 cal | calendar | Observation window with green metrics. After it elapses (and the 30-day Sanity history rollover, if you chose the lazy path in Phase 1), downgrade Sanity plan to Free. |

## When to revisit this proposal

Trigger this work when **any** of the following becomes true:

- The Sanity Growth subscription renews and you want to stop the
  R285/month outflow.
- Sanity costs scale beyond ~3× (adding seats, datasets) such that the
  break-even maths flip.
- A POPIA audit or compliance review specifically calls out third-party
  PII processors as a risk.
- The order volume grows enough that Sanity's per-row pricing or rate
  limits start to bite (currently nowhere near).

Until one of those triggers, the simpler answer remains **pay $15/month
for Sanity Growth** and treat this plan as the documented escape hatch.

# Payment retry flow — design proposal

**Status:** implemented (2026-05-14).
**Related:** `docs/orders-and-tracking.md`, `docs/security.md`.

## Implementation notes (post-design)

- **Endpoint** lives in `backend/src/routes/payment-retry.ts`. Mounted under
  `/orders/:ref/retry-payment` in `backend/src/app.ts`.
- **`emailsMatch`** was extracted from `order-lookup.ts` to a shared module
  `backend/src/email-match.ts` so both lookup and retry use the same
  constant-time helper rather than duplicating the SHA-256 + `timingSafeEqual`
  pattern.
- **Retry adapter** `getOrderForRetry` and the atomic counter
  `incrementRetryAttempt` live in `backend/src/orders-store.ts`. The adapter
  picks the DynamoDB `createdAt` (not Sanity's `_createdAt`) for retry-window
  math — see § Phase compatibility for the rationale.
- **Step 4 placement deviation.** The design's original step ordering put
  the per-orderRef counter increment BEFORE the email + status + window
  checks (so it was "cheap, before any DB read"). Implementing strictly that
  way would let a distributed attacker burn the customer's 5 lifetime retry
  slots by spraying wrong-email attempts against a known orderRef. The
  implementation moved the counter AFTER the auth checks: only genuinely
  authenticated retries count against the cap. Logged here so anyone who
  reads the design wondering "why doesn't the code match step 4?" finds
  the answer.
- **Failed-payment email** uses an orderRef-only tracking link
  (`/track?ref=X`, no email param). The design called for this; the existing
  `trackingLink()` helper still injects email for non-failed-payment
  templates (where the customer hasn't been told anything alarming), and
  this template builds its own URL to honour the no-email-in-URL rule.
- **PayFast `m_payment_id` reuse — resolved.** Verified against the
  public sandbox: PayFast accepts the same `m_payment_id` on a
  re-submitted form, so the eventual ITN updates the original Sanity
  doc as designed. The `.rN`-encoding fallback in the original plan
  isn't needed. (Documented here for the audit trail; the live code
  path is the straight-through reuse.)

## Pre-implementation requirements (historical — all resolved)

These items had to be resolved before the design could ship; they're
documented for the audit trail.

1. **PayFast `m_payment_id` reuse semantics — resolved.** Verified
   against the public sandbox: PayFast accepts the same `m_payment_id`
   on a re-submitted form. The `.rN`-encoding fallback isn't needed.
2. **`crypto.timingSafeEqual` on email comparison — resolved.** Both
   the retry handler and the existing `GET /orders/:ref?email=` go
   through `emailsMatch()` in `backend/src/email-match.ts` (SHA-256 +
   `timingSafeEqual`).

## Problem

When a PayFast payment fails (card declined, bank timeout, customer
clicks "Cancel" on the sandbox page), the order is left in
`pending_payment` status in Sanity and the customer has no in-app way
to re-attempt payment for the same order. Their current options are:

1. Place a fresh order from scratch — produces a duplicate `pending_payment`
   row with a different `orderRef`, confusing for both Meryl and the
   customer.
2. Give up entirely — lost sale.

Both are bad outcomes for a flow where the underlying issue is usually
transient (insufficient funds, 3-D Secure timeout, mistyped CVV).

## Goal

A self-service "Retry payment" path that lets a customer re-submit the
**same** order to PayFast, so the eventual successful ITN updates the
original Sanity document rather than orphaning the first one.

## Threat model

The endpoint mints a freshly-signed PayFast form for an existing order
ref. The defences below address each abuse vector.

| Attack | Mitigation |
|---|---|
| Enumerate valid `orderRef`s | OrderRef is 6 base-36 chars (~2.2B combos) + per-IP rate limit + 404 for every failure path (no distinction between "doesn't exist", "wrong email", "wrong status", "too old") |
| Guess emails for a known ref | Per-IP rate limit + constant-time email compare |
| Re-pay an already-paid order | Status guard: only `pending_payment` orders are retryable |
| Replay retries on ancient orders | Retry window: order's `createdAt` must be within 7 days |
| Flood PayFast with retries for one order | Per-`orderRef` lifetime cap (5 retries total across the order's life — see "Per-orderRef rate limit" below for why a sliding window was rejected) on top of the per-IP limiter |
| Tamper with amount | Server recomputes from stored values; the client never supplies an amount |
| Timing oracle on the 404 paths | Every failure path performs the same store read (Phase 0: Sanity; Phase 1: DynamoDB) plus `crypto.timingSafeEqual` (over SHA-256 digests of both emails, so the length is not a side channel) before returning |
| PayFast `m_payment_id` reuse rejected by PayFast | See Pre-implementation requirements §1 — must be verified against sandbox before shipping |
| Leak PII into CloudWatch (success path) | Logs only `orderRef + action + result`. No email value, no customer name, no items. Regression-guarded like the existing admin routes |
| Leak PII into CloudWatch (error path) | DynamoDB / Sanity / signature errors stringify the error message with `err instanceof Error ? err.message : String(err)` and never pass the raw error object to `console.error` — same defence as `orders-store.ts` |
| CSRF from another origin | Existing `ALLOWED_ORIGINS` CORS gate. No cookies/session — the endpoint authenticates by `email` query param only |
| Phishing via email link | Payment-failed emails link to `/track?ref=X`, never to the retry endpoint directly, and never include the email value in the URL |

## Endpoint

```
POST /orders/:ref/retry-payment?email=<customer-email>
```

**Why POST**: avoids accidental browser-reload re-submissions, sidesteps
URL-caching of signed PayFast form data, matches the convention of
`POST /orders`.

**Why query-param `email`**: mirrors the existing `GET /orders/:ref?email=`
track lookup so the frontend uses one familiar shape.

### Response shapes

| Status | Body | When |
|---|---|---|
| 200 | `{ success: true, ref, payfast: { ...signed form data... } }` | Happy path. Identical shape to `POST /orders` |
| 404 | `{ error: "Order not found" }` | Any auth/state failure: missing email param, order doesn't exist, email mismatch, wrong status, too old. **No `.` at the end** — matches the literal string emitted from `order-lookup.ts` |
| 429 | `{ error: "Too many requests. Please try again later." }` | Per-IP or per-orderRef rate limit exceeded — literal string from `rate-limit.ts` |

A 404 is returned for **all** failure cases except rate-limit to
maintain the no-enumeration policy that `GET /orders/:ref?email=`
already follows. Notably, a missing `email` query param **also** returns
404 (not 400) — matching the equivalent path in `order-lookup.ts` so a
caller can't distinguish "ref is valid, missing email" from "ref
doesn't exist".

## Server-side flow (fail-closed at every step)

```
1. Per-IP rate limit                    → 429 if exceeded
2. Validate :ref shape (MG-YYMMDD-...)  → 404 if malformed (no DB call)
3. Validate email param present         → 404 if missing (same 404 body
                                          as auth failures, no leak)
4. Per-orderRef rate limit              → 429 if exceeded
5. Load order via orders-store adapter:
   - Phase 0 + Phase 1: a unified getOrderForRetry(orderRef) returns
     { status, amountZar, createdAt, customerEmail }
   - In Phase 0 the adapter reads everything from Sanity; in Phase 1
     it joins Sanity (status, amountZar) with DynamoDB (PII fields).
     The handler never knows which phase it's in.
6. emailsMatch(stored.email, supplied.email) — SHA-256 + timingSafeEqual
   (the same helper introduced in order-lookup.ts; do not reimplement)
7. status === 'pending_payment'
8. now - order.createdAt < 7 days
9. Use the order's STORED amountZar — do NOT re-look-up product prices.
   The customer agreed to that amount at order creation; re-deriving
   from current Sanity prices would (a) break the ITN amount check if
   Meryl edits a product price between order and retry, and (b) could
   undercharge if the new price is lower. The server-side trust at
   retry comes from the fact that amountZar was server-computed at the
   original POST /orders.
10. Sign a fresh PayFast form with the SAME orderRef so the eventual
    ITN updates the existing order document
11. Audit log:  retry-payment orderRef=MG-... result=ok
12. Return signed form data
```

Any failure between steps 5–9 returns 404 with the same body and
similar timing. Steps 1–4 are cheap, before any DB read, so they
don't help an attacker time-distinguish.

**Accepted inconsistency:** step 1 (per-IP rate limit) fires before
step 3 (email validation), so a caller who deliberately omits the
email burns per-IP rate-limit tokens without consuming per-orderRef
tokens. Same behaviour as `POST /orders`. Not worth correcting.

## Per-orderRef rate limit

**Lifetime cap of 5 retries** per orderRef, enforced atomically on the
DynamoDB order row. After 5 attempts the order can never be retried
again — Meryl will see those orders sit in `pending_payment` past
their 7-day window and can chase the customer manually.

**Why lifetime, not a 24h sliding window:** a sliding window cannot
be expressed in a single `UpdateItem` `ConditionExpression` —
DynamoDB conditions don't support the conditional-branching logic
needed to "reset the counter if the last attempt was >24h ago".
Implementing a real sliding window would require either a transaction
(`TransactGetItems` + `TransactWriteItems`) or a separate per-order
counter record with its own TTL. Both are heavier than the threat
warrants. A lifetime cap of 5 is stricter, simpler, and means a
genuinely persistent attacker can't pace their retries to stay under
the limit forever. The cost is that a customer with a string of bad
luck (5 failed cards over a week) hits the cap and has to ask Meryl
to handle the order manually — acceptable trade.

The increment is a single DynamoDB `UpdateItem` call with both an
`ADD` and a `ConditionExpression`:

```ts
await client.send(new UpdateCommand({
  TableName: getOrdersTableName(),
  Key: { orderRef },
  UpdateExpression:    'ADD retryAttempts :one SET lastRetryAt = :now',
  ConditionExpression: 'attribute_not_exists(retryAttempts) OR retryAttempts < :max',
  ExpressionAttributeValues: {
    ':one': 1,
    ':max': MAX_RETRIES,   // 5 — lifetime cap, not per-window
    ':now': new Date().toISOString()
  }
}));
```

`lastRetryAt` is written for audit visibility (Meryl can see when the
customer last tried), not for the enforcement logic. The condition
only inspects `retryAttempts`.

If the condition fails (`ConditionalCheckFailedException`), the handler
returns 429. Two concurrent requests both attempt the update; only one
succeeds when the condition still holds, the other gets rejected
atomically — no TOCTOU window.

The test matrix must include a concurrency test that fires N+1 retry
requests in parallel and asserts exactly N succeed (not N+1).

**State-rot note.** `retryAttempts` and `lastRetryAt` are written onto
the DynamoDB row and never cleaned up before the row's own `ttl`
fires at `createdAt + 365 days`. An order that was retried twice and
then aged past its 7-day retry window will sit with
`retryAttempts = 2` for up to a year. This is not a security issue
(the 7-day window guard at step 8 closes retry attempts long before
the counter would matter), but any future tooling that reads
`retryAttempts` to look for "actively retrying" customers should
filter on `now - createdAt < 7 days` alongside the counter.

## Frontend surfaces

### 1. `/payment/cancelled?ref=<ref>` page

Currently just says "your payment was cancelled". Add:

- Email input field (bound to a Svelte `$state` variable, **not** read
  from the URL)
- "Retry payment" button — fetches `POST /orders/:ref/retry-payment?email=...`
- On 200: build the hidden-input PayFast form using **Svelte template
  interpolation** (`{value}`) — never `{@html}` or direct `innerHTML`
  assignment. The existing checkout flow already does this; mirror it.
- On 404: generic "couldn't retry — please contact us" (don't leak which
  guard failed)
- On 429: "too many requests, please try again in a few minutes"

### 2. `/track?ref=<ref>&email=<email>` page

Add a "Retry payment" CTA visible only when the looked-up order has
`status === 'pending_payment'` AND `now - createdAt < 7 days`.

The CTA **must be a form submit** (`<form on:submit={...}>`) or a
button bound to a JS handler that issues `fetch(...)` — never an
`<a href="...">` link that includes `?email=...` in its URL. A
clickable href would put the email in `document.referrer` for the
subsequent cross-origin navigation to PayFast, leaking PII to a third
party. The email value is already in memory (bound to the track form's
Svelte state), so the handler reads it from there and passes it as the
fetch's query param. Same Referer-leak concern is documented in
`docs/security.md § Risk 6`.

### 3. Payment-failed email (new template)

Sent by the existing `EMAIL_BACKEND` plumbing. Two trigger options:

- **Option A: fire on the first failed ITN.** Snappy feedback. Fits
  the existing synchronous email-trigger architecture cleanly — the
  ITN handler already short-circuits on `paymentStatus !== 'COMPLETE'`
  (the non-COMPLETE short-circuit early in `payfast-itn.ts`), and an
  email-send call slots in there.
  Risks emailing a customer whose retry succeeds moments later.
- **Option B: fire after 24h with no successful ITN.** Gentler — only
  reaches customers who actually walked away. But requires new
  infrastructure: either (i) a DynamoDB TTL + Streams + Lambda chain
  triggered when a `pending_payment` order is 24h old, or (ii) an
  EventBridge scheduled rule that scans for stale orders. Neither
  exists today, so picking Option B expands scope materially.

**Recommendation: Option A.** Lower implementation cost, matches the
existing event-driven email model, and the "scared the customer with a
'failure' email when their retry just succeeded" risk is mitigated by
the email's wording — frame it as "Your payment didn't go through this
time — you can retry here" rather than "Your order has failed."

**Known abuse vector with Option A — victim spam.** `POST /orders` does
not verify the `customerEmail` it accepts. An attacker can submit
orders using a third party's email, abandon the PayFast page, and
cause the failed-ITN email to be delivered to that third party from
our Resend domain. Mitigations:

1. The existing per-IP rate limiter on `POST /orders` (5 orders / 15
   minutes) caps the per-instance volume. It is in-memory and per-
   Lambda, so a distributed source IP attacker can bypass it.
2. The Resend free-tier quota (3000 emails / month) caps the absolute
   damage. A sustained attack could exhaust the quota and silence
   legitimate order emails. Resend exposes per-domain send logs via
   their API but no pre-aggregated monthly counter endpoint suitable
   for native CloudWatch polling — adding an alarm requires a
   scheduled Lambda that hits Resend's API, accumulates a count, and
   publishes a custom CloudWatch metric. Worth tracking as a v2 task,
   not a one-line config change.
3. The email template must include a one-line "didn't place this
   order? Ignore this message" footer so the victim has context.

This is not a blocker but the doc shouldn't pretend Option A is free
of cross-account abuse risk. Watch for Resend quota exhaustion and
plan for a stricter per-IP+per-email limit on `POST /orders` if abuse
materialises post-launch — though note that per-email limits also
bypass via rotated victim addresses (each new victim email resets
the counter). The only durable mitigation is email verification on
`POST /orders` (double-opt-in confirmation before any failed-payment
email is sent), which is out of scope for v1 but worth queuing if
the attack ever materialises.

The email links to `/track?ref=X` — **not** the retry endpoint, and
**never** includes the email value as a URL param. The link is
unauthenticated; the customer types their email on the /track page.

## What's deliberately NOT in scope

- **No "regenerate orderRef" path.** Same ref across retries is the whole
  point — the ITN handler is already keyed on orderRef and will update
  the existing doc.
- **No "edit cart items" on retry.** That's a new order, not a retry.
  Mixing them creates amount-tampering surface area.
- **No persistent retry-attempt records in Sanity.** Counter lives on
  the DynamoDB order row only; Sanity stays the lean status doc.
- **No email-link auto-auth tokens.** Adding a one-time-use signed
  token in the email URL eliminates the "type your email" step but
  doubles the surface area and creates a phishing-friendly URL pattern.
  The extra friction of typing the email is the right trade.

## ITN handler idempotency

A pre-requisite for retry safety: if PayFast eventually delivers BOTH
the original failed ITN and the successful retry ITN (PayFast retries
delivery for up to 24h), the handler must accept duplicate ITNs for an
already-paid order without double-processing.

**Already satisfied** by the existing guard in `payfast-itn.ts`:

```ts
if (order.status !== 'pending_payment') {
    // skipping — already past pending
    return c.text('OK', 200);
}
```

Whichever ITN arrives second sees `status === 'payment_received'`,
short-circuits to 200, and doesn't re-emit emails or re-write state.
No code change needed for this requirement. The corresponding test
exists in `payfast-itn.test.ts`; the test matrix entry below ensures
it stays covered.

## Tests required

| Test | Path |
|---|---|
| Correct ref + email + pending → 200 + signed form data | success |
| Wrong email on real order → 404 (no leak) | enumeration |
| Wrong ref → 404 | enumeration |
| Missing `email` query param → 404 (not 400) | enumeration |
| `payment_received` order → 404 | status guard |
| Order older than 7 days → 404 | window guard |
| Per-IP rate limit → 429 | abuse |
| Per-orderRef rate limit → 429 | abuse |
| Concurrency: N+1 retry requests in parallel → exactly N succeed, 1 gets 429 (DynamoDB `ConditionExpression` is the only thing keeping this race closed) | abuse |
| 404 response bodies + timing within tolerance across all "not found" paths | no-leak |
| Audit log (success path) doesn't contain email or customer name | logging policy |
| Audit log (error path): DynamoDB-failure, Sanity-failure, signature-mismatch log lines don't contain email or customer name | logging policy |
| ITN handler is idempotent: second ITN for a paid order returns 200, no double-status-update | concurrency |
| Amount returned by retry equals the order's stored `amountZar`, even if the underlying product's Sanity price has since changed | correctness |
| Server doesn't trust client-supplied amount: retry endpoint accepts no amount param | tamper |

## Phase compatibility

The endpoint code path doesn't change between phases — but it depends
on the `orders-store.ts` adapter exposing a unified shape:

```ts
type RetryReadModel = {
  status:        OrderStatus;
  amountZar:     number;
  createdAt:     string;
  customerEmail: string;  // canonical (lowercased, trimmed) form
  customerName:  string;  // needed for PayFast name_first/name_last (audit M-3)
};

export function getOrderForRetry(orderRef: string): Promise<RetryReadModel | null>;
```

No `items` field is required — PayFast's `item_name` for the
re-signed form follows the same generic pattern as `POST /orders`
(`Meryl Green Designs order ${orderRef}`), which is derived from
`orderRef` alone. The retry endpoint doesn't need per-item data
because it doesn't change the cart.

- **Phase 1 (current, live since 2026-05-13):** the adapter joins
  Sanity (status + amountZar) with DynamoDB (customerEmail +
  customerName + createdAt). DynamoDB stores `createdAt` without
  the underscore (the orders-store dual-write maps
  `sanityOrder._createdAt → item.createdAt`).
- **Phase 0 (pre-cutover, historical):** the adapter read all
  fields from the Sanity order doc directly. The Phase 0 code path
  no longer exists in the repo; this is documented for context only.

The retry handler calls `getOrderForRetry`, NOT the existing
`getOrderByRef` — the former is the dedicated five-field projection
defined above; the latter is the general-purpose join used by the
track page and Studio panels.

## Open questions

1. **Retry window length.** 7 days proposed. Shorter (3 days) is safer
   against ancient-order retries but might frustrate customers who
   come back after a weekend. Longer (14 days) is friendlier but
   accumulates more retryable state. Decide based on Meryl's
   expectations once she's seeing real failure patterns.
2. **Failed-ITN email trigger — resolved (Option A is live).**
   `backend/src/routes/payfast-itn.ts` fires the
   `paymentFailedTemplate` on the first failed ITN, dedup-guarded by a
   DynamoDB `recordFailedItn` marker keyed on PayFast's `pf_payment_id`
   to suppress duplicates across PayFast's 24h retry window. The
   delayed-trigger alternative (Option B) was ruled out as not worth
   the EventBridge complexity at current scale.

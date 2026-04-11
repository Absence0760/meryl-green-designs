# Security

Cross-cutting security risks and mitigations for Meryl Green Designs. This
doc is the single place to look for "is X safe?" and "what are we not
protecting against?". Pair it with `docs/orders-and-tracking.md`, which has
the detailed design of the order flow.

**Threat model in one sentence:** a small-volume e-commerce site with one
owner, no card processor, and no customer accounts. The worst plausible
outcomes are (1) fraudsters impersonating the business, (2) PII leakage
from order documents, and (3) automated spam of the order form or webhook
endpoints. We are **not** trying to defend against targeted nation-state
adversaries.

---

## Risk register

Each risk is rated **likelihood × impact** on a small-business scale:

- **Likelihood:** low / medium / high — how often this is realistically going
  to happen to a site at this scale.
- **Impact:** low / medium / high — how much damage a successful instance
  does.

### 1. Impersonation scams (banking details)

| | |
|---|---|
| **Likelihood** | medium |
| **Impact** | high |

**What could happen:** A fraudster harvests banking details (from an
invoice, from the site, from a leaked email) and sends fake "urgent overdue
invoice" messages to third parties impersonating Meryl Green Designs. The
victim pays the real account number, Meryl later gets complaints from
strangers who think she scammed them. Reputational damage far exceeds the
direct financial loss.

**Current mitigations:**
- Banking details are **not** on the shop page.
- Banking details are **not** in any automated email (neither owner
  notification nor customer confirmation).
- Banking details are **not** in `backend/.env.example`, `infra/variables.tf`,
  or anywhere else in git.
- Banking details are sent only as a **direct manual reply** from Meryl to
  the order-confirmation email thread, after she has read the order.
- A regression test (`backend/src/__tests__/email.test.ts` → "never leaks
  banking details in the pending-payment email") fails if `account number`
  or `branch code` text appears in the automated customer email.
- The customer acknowledgement email sets expectations: it tells the
  customer to expect a personal reply with banking details, so a two-email
  sequence doesn't look like a scam to the customer either.

**Residual risk:**
- Once Meryl has sent the details in her reply, they're in the customer's
  inbox and their mail provider's retention — out of our control.
- Meryl's own email account is now the weakest link. If it's
  compromised, so is every banking reply. **Mitigation for later:** turn on
  2FA on the email account used to send replies (Gmail, Outlook, whatever).
  This is outside the repo.

**What would reduce residual risk further (not implemented):**
- Dedicated sender domain with strict DMARC/SPF/DKIM, so impersonation
  attempts from lookalike domains fail delivery.
- Watermarked PDF invoices with the order reference and amount, so victims
  of an impersonation scam can distinguish a real Meryl Green Designs
  invoice from a forged one.

---

### 2. Order-form abuse / automated order spam

| | |
|---|---|
| **Likelihood** | high |
| **Impact** | low |

**What could happen:** Bots submit junk orders to the form. Each one creates
a Sanity document, triggers two Resend API calls, and clutters Meryl's
inbox.

**Current mitigations:**
- Honeypot field (`website`) in the order form. If filled, the backend
  silently returns `{ success: true, ref: 'SKIPPED' }` — no Sanity write, no
  email. Tests cover this (`orders.test.ts` → "treats a filled honeypot as
  a silent skip").
- Backend validation: required fields, valid email regex, length limits on
  every field. Tests cover every length limit.
- CORS restricts browser-origin submissions to the allowlisted domains.
  Server-to-server clients still reach it, but CORS cuts down on
  opportunistic browser-side exploitation.

**Residual risk:**
- **No rate limiting.** A determined bot can flood the endpoint. There is
  currently no per-IP or global throttle on `POST /orders`. This is the
  single biggest hardening gap in the order flow. See roadmap.
- Bots that run a headless browser and don't fill the honeypot will still
  succeed. Sanity is the backstop — Meryl sees every order and can mark
  obvious junk as `cancelled`.

**Mitigation priority:** add rate limiting before the site sees any real
volume. Hono middleware (e.g. `hono-rate-limiter`) or AWS API Gateway
throttling on the Lambda Function URL (if it starts supporting it) are the
two realistic options.

---

### 3. Order enumeration

| | |
|---|---|
| **Likelihood** | low |
| **Impact** | medium |

**What could happen:** An attacker guesses order references (`MG-YYMMDD-XXXX`)
to look up strangers' orders on `/track`.

**Current mitigations:**
- `XXXX` is 4 random base-36 characters (~1.6M combinations per day).
- `GET /orders/:ref` requires an email parameter that must match the order's
  `customerEmail` (case-insensitive). Without the email, the endpoint
  returns 404.
- A **wrong email** returns 404 (not 403), so an attacker can't distinguish
  "real ref, wrong email" from "fake ref". Covered by tests.

**Residual risk:**
- 4 characters of entropy is adequate but not generous. Bumping to 6
  characters would take this from ~1.6M/day to ~2B/day combinations — worth
  doing before volume grows.
- No rate limiting on the lookup endpoint, so a persistent attacker with
  both a valid ref and a guess at the email could brute-force the email.
  Same fix as risk #2.

---

### 4. Sanity webhook forgery

| | |
|---|---|
| **Likelihood** | low |
| **Impact** | medium |

**What could happen:** An attacker POSTs a forged webhook to
`/webhooks/sanity-order`, triggering unwanted "payment received" or
"shipped" emails to customers.

**Current mitigations:**
- Every webhook request is HMAC-SHA256 verified against
  `SANITY_WEBHOOK_SECRET` over the **raw request body** (before JSON
  parsing, so body-tampering doesn't slip past). Implemented with
  `timingSafeEqual`.
- Missing header, malformed header, wrong secret, and tampered-body cases
  are all tested (`sanity-webhook.test.ts` — 11 tests).
- A missing `SANITY_WEBHOOK_SECRET` on the Lambda short-circuits to 500
  before any signature check, so a mis-configured prod can't become
  accidentally open.

**Residual risk:**
- If `SANITY_WEBHOOK_SECRET` leaks, so does the webhook. Rotate if the
  Lambda's env vars are ever suspected of exposure. Rotation is
  `terraform apply` + updating the secret in the Sanity dashboard.

---

### 5. PII in `/orders/:ref` responses

| | |
|---|---|
| **Likelihood** | medium |
| **Impact** | medium |

**What could happen:** The tracking endpoint returns `customerPhone`,
`shippingAddress`, or `internalNotes` to anyone who knows the ref + email.
A customer forwarding their tracking link (innocently or not) could
inadvertently dox themselves.

**Current mitigations:**
- `backend/src/routes/order-lookup.ts` runs every Sanity order through a
  hand-written `sanitise()` function that **explicitly omits**
  `customerPhone`, `shippingAddress`, and `internalNotes`. The response
  shape is closed — not a passthrough.
- Tested: `orders.test.ts` → "returns a sanitised order when the email
  matches" asserts both that expected fields are present and that
  `customerPhone`/`shippingAddress` are `undefined`.

**Residual risk:**
- `customerName` and `items` are in the response. Both are required for the
  tracking UI to be useful, so this is accepted.

---

### 6. PII in tracking URLs

| | |
|---|---|
| **Likelihood** | medium |
| **Impact** | low |

**What could happen:** Tracking links in emails are
`/track?ref=...&email=...`. The customer's email lands in browser history,
referrer headers, and any proxy logs along the path.

**Current mitigations:**
- The email parameter is only the customer's own email, not anyone else's.
- The worst case is "customer's own email in their own browser history" —
  not a disclosure to third parties.

**Residual risk:**
- If a customer shares a tracking URL publicly (e.g. in a support forum
  screenshot), their email is visible.
- External referrers: if the customer clicks an external link from the
  `/track` page, their email could leak via Referer header. Mitigated by
  SvelteKit's default `referrer` policy, which is `strict-origin-when-cross-origin`
  for modern browsers, so the query string is not forwarded cross-origin.

**What would reduce residual risk (not implemented):**
- Sign a short-lived token in the confirmation email instead of putting the
  email in the URL. Swap `?ref=…&email=…` for `?t=<jwt>`. Adds complexity
  and a key to manage. Not worth it at current scale.

---

### 7. Cross-origin access (CORS)

| | |
|---|---|
| **Likelihood** | low |
| **Impact** | medium |

**What could happen:** A malicious site tricks a logged-in user's browser
into submitting requests to the backend on their behalf.

**Current mitigations:**
- CORS is strictly origin-matched against `ALLOWED_ORIGINS` (prod) or
  `http://localhost:7777` (local fallback). Non-listed origins get **no**
  `access-control-allow-origin` header, so browser fetches fail.
- CORS `allowMethods` is limited to `GET, POST, OPTIONS`. No `DELETE`, no
  `PUT`.
- Tested: `app.test.ts` covers both listed and unlisted origin cases, plus
  OPTIONS preflight.

**Residual risk:**
- There is no CSRF token on `POST /orders`, because there is no session /
  login — the form is available to anonymous users by design. CORS is the
  only gate. Acceptable for a public order form.

---

### 8. Secrets management

| | |
|---|---|
| **Likelihood** | low |
| **Impact** | high |

**What could happen:** A secret (Resend API key, Sanity API token, webhook
secret) leaks via git history, CI logs, or a compromised dev machine.

**Current mitigations:**
- All secrets are in `.env` files that are `.gitignore`d, and in Terraform
  variables marked `sensitive = true`. The example files
  (`backend/.env.example`, `infra/terraform.tfvars.example`) list the
  variable names with empty values only.
- Production secrets are injected into the Lambda as environment variables
  at `terraform apply` time. They do not appear in the Lambda's source
  package or any git artifact.
- CI/CD uses **GitHub OIDC** federation to assume an AWS role — there are
  no long-lived AWS access keys in GitHub secrets.
- `.claude/settings.json` denies common destructive AWS commands
  (`aws s3api delete-bucket`, `aws cloudfront delete*`, etc.) to make
  accidental leaks less likely during interactive debugging.

**Residual risk:**
- Secrets are still in `terraform.tfvars` on the operator's laptop. Treat
  that file like an SSH key.
- Resend, Sanity, and AWS console credentials belong to the operator and
  are outside repo scope. MFA on all three is essential and not enforced by
  anything in this repo.

---

### 9. Dependency vulnerabilities

| | |
|---|---|
| **Likelihood** | medium |
| **Impact** | low–medium |

**What could happen:** A transitive dependency (Hono, Sveltekit, Sanity
client, Resend SDK, esbuild, vitest, etc.) ships a CVE. We pick it up via
`pnpm install` on the next deploy.

**Current mitigations:**
- `pnpm-lock.yaml` is committed — builds are reproducible.
- Direct deps are pinned or narrow-ranged. No `^0.x.*`-style wildcards on
  critical packages.
- No runtime code fetches from external sources.

**Residual risk:**
- No automated vulnerability scanning (Dependabot, Renovate, `pnpm audit`
  in CI). **This is a gap** — worth adding a simple `pnpm audit` step to a
  scheduled GitHub Actions workflow.

---

## What this site explicitly does not protect against

Documenting the non-goals so they're not mistaken for gaps:

- **Nation-state or targeted attacks.** The threat model is
  "opportunistic bots + small-scale fraud." A determined adversary with
  meaningful resources will get through.
- **Account takeover of customer accounts.** There are no customer
  accounts.
- **Card fraud.** There is no card processor. Payments are EFT.
- **DDoS.** Lambda + CloudFront absorb a surprising amount, but we haven't
  sized for an actual attack. WAF is out of scope.
- **Insider threat from Meryl.** She has full Sanity access and can
  unilaterally edit every order. That's the cost of being the sole
  operator; the alternative is a much more complex admin split.

---

## Incident playbook (short version)

If something goes wrong:

1. **Suspected banking-detail impersonation.** Contact the bank immediately,
   notify Resend of phishing abuse, post a notice on the website. Rotation
   is not needed (the account isn't compromised, just being impersonated).
2. **Suspected `SANITY_WEBHOOK_SECRET` leak.**
   - Generate a new secret: `openssl rand -hex 32`.
   - Update `infra/terraform.tfvars` → `terraform apply`.
   - Update the secret in the Sanity webhook configuration to match.
3. **Suspected `SANITY_API_TOKEN` leak.**
   - Revoke the token in Sanity dashboard → API → Tokens.
   - Create a new one, update `infra/terraform.tfvars` → `terraform apply`.
4. **Suspected `RESEND_API_KEY` leak.**
   - Revoke in the Resend dashboard.
   - Create a new key, update tfvars → apply.
5. **Sanity database compromised or accidentally made public.**
   - In the Sanity dashboard, set the `production` dataset to **private**
     (it should already be).
   - Revoke and rotate `SANITY_API_TOKEN` regardless, since it was the only
     thing standing between anonymous clients and the order documents.

---

## Known hardening gaps (roadmap items)

Captured here so they don't get lost:

- **Rate limiting** on `POST /orders`, `GET /orders/:ref`, and
  `POST /webhooks/sanity-order`.
- **Dependency scanning** — a scheduled `pnpm audit` workflow in GitHub
  Actions.
- **Bumping order ref entropy** from 4 to 6 base-36 characters before
  volume grows.
- **Dedicated sender domain with DMARC/SPF/DKIM** for the outbound Resend
  email identity, to make impersonation harder outside the repo.
- **Signed tokens on tracking URLs** instead of email-in-querystring. Low
  priority.

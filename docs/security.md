# Security

Cross-cutting security risks and mitigations for Meryl Green Designs. This
doc is the single place to look for "is X safe?" and "what are we not
protecting against?". Pair it with `docs/orders-and-tracking.md`, which has
the detailed design of the order flow.

**Threat model in one sentence:** a small-volume e-commerce site with one
owner, PayFast as a payment processor (redirect model, no card data on our
server), and no customer accounts. The worst plausible
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
- **Per-IP rate limiting** (`backend/src/rate-limit.ts`) on every
  state-changing endpoint, configured at the route level:

  | Route | Limit |
  |---|---|
  | `POST /orders` | 5 / 15 minutes per IP |
  | `POST /enquiries` | 5 / 15 minutes per IP |
  | `GET /orders/:ref` | 20 / minute per IP |
  | `POST /webhooks/sanity-order` | 60 / minute per IP |
  | `POST /webhooks/payfast-itn` | 60 / minute per IP |

  Implementation is an in-memory fixed-window limiter keyed on the first
  IP in `x-forwarded-for` (populated by CloudFront / API Gateway as the
  request traverses the front-door stack).
  Over the limit returns `429 Too Many Requests` with a `Retry-After`
  header. Covered by `__tests__/rate-limit.test.ts` (12 tests including
  integration regression guards on `/orders` and `/orders/:ref`).

**Residual risk:**
- **In-memory limits are per-Lambda-instance.** A request that lands on a
  cold-started instance starts with a fresh bucket; under heavy
  concurrency, the effective global limit is `max × instances`. For
  single-IP flooding this is still meaningfully restrictive; for
  distributed-attacker mitigation (botnet) the global cap is now AWS
  API Gateway stage-level throttling (`infra/api_gateway.tf`,
  50 rps / 100 burst). A shared store (DynamoDB, Redis) or AWS WAF would
  give per-route or per-IP precision; out of scope at current volume.
- Bots that run a headless browser and don't fill the honeypot can still
  succeed up to the rate-limit cap. Sanity is the backstop — Meryl sees
  every order and can mark obvious junk as `cancelled`.

---

### 3. Order enumeration

| | |
|---|---|
| **Likelihood** | low |
| **Impact** | medium |

**What could happen:** An attacker guesses order references (`MG-YYMMDD-XXXXXX`)
to look up strangers' orders on `/track`.

**Current mitigations:**
- `XXXXXX` is 6 random base-36 characters (~2.2 billion combinations per day).
- `GET /orders/:ref` and `POST /orders/:ref/retry-payment` both require an
  email parameter that must match the order's `customerEmail`
  (case-insensitive). Without the email, the endpoint returns 404.
- A **wrong email** returns 404 (not 403), so an attacker can't distinguish
  "real ref, wrong email" from "fake ref". The retry endpoint extends this
  to every fail state: malformed ref, missing email, wrong status, and
  out-of-window all share a single 404 body. Covered by tests
  (`payment-retry.test.ts § no-enumeration policy`).
- Email comparison goes through a shared SHA-256 + `timingSafeEqual`
  helper (`backend/src/email-match.ts`) so a timing oracle can't leak the
  stored email one byte at a time. The helper hashes both sides before
  comparing — `timingSafeEqual` operates on fixed-length digests, closing
  the length-based side channel too.
- The retry endpoint adds an **atomic per-orderRef lifetime cap** of 5
  attempts, enforced by a DynamoDB `UpdateCommand` ConditionExpression
  (`incrementRetryAttempt` in `orders-store.ts`). The counter only
  increments AFTER auth + status + window checks pass, so a
  wrong-email spray can't burn a legit customer's retry slots.

**Residual risk:**
- The 20/min lookup rate limit caps brute-force attempts at ~28k/day per
  IP. With 6-char base-36 entropy (~2.2B refs per day) and required email
  verification, fully enumerating one day's refs from a single IP would
  take ~78,000 days; from 1,000 distributed IPs, ~78 days. Computationally
  infeasible at any realistic scale.
- The retry endpoint accepts the customer email as a `?email=` URL query
  parameter (POST). Email values won't reach CloudWatch (logs only
  `orderRef + action + result`), but they may surface in API Gateway
  access logs if those are ever enabled — neither is currently configured
  to capture access logs.
- The retry CTA on `/track` reads the email from in-memory Svelte state
  (populated either by the customer typing it into the form or by the
  `?email=` URL param the email-link uses). The retry POST uses
  `fetch()`, not a navigation, so no Referer header is sent to PayFast.
  The email-in-URL residual risk is the same one already accepted for
  the track URL itself; this is an extension of that acceptance, not a
  new exposure.

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
secret) leaks via git history, CI logs, a compromised dev machine, or
ends up encrypted with the wrong key.

**Current mitigations:**
- **SOPS + AWS KMS encryption.** `infra/terraform.tfvars.sops` and
  `backend/.env.sops` are committed to the repo as encrypted blobs. The
  encryption root is a project-dedicated KMS key (`alias/meryl-green-designs-sops`
  in `af-south-1`) with `kms:Decrypt` gated by IAM. See
  `docs/deployment.md § Secrets management` for the full workflow and
  recovery procedures.
- **Access is IAM-bound, not file-bound.** There is no private key file on
  any laptop. Whoever has `kms:Decrypt` on the project's KMS key — via
  their IAM identity's policies — can decrypt. Revocation is an IAM
  change, takes effect immediately.
- **CloudTrail records every `kms:Decrypt` call** against the key. If a
  credential is suspected leaked, CloudTrail tells you when it was last
  used and from what source.
- **Automatic key-material rotation is enabled** on the KMS key. AWS
  rotates the underlying cryptographic material annually while keeping
  the same alias — encrypted files keep working without re-encryption.
- **Plaintext secrets are gitignored.** `.gitignore` covers `.env`,
  `.env.*` (with an exception only for `.env.example` and `.env.sops`),
  and `*.tfvars` (except `.tfvars.example` and `.tfvars.sops`). A stray
  `git add infra/terraform.tfvars` is blocked before it can stage.
- **`bin/setup.sh` decrypts to a scratch file and shreds it on exit.**
  The plaintext `terraform.tfvars` exists only for the duration of a
  Terraform apply; a bash `trap` on EXIT deletes it even if the script
  errors out.
- **Production secrets are injected into the Lambda as env vars** at
  `terraform apply` time. They do not appear in the Lambda's source
  package, any git artifact, or CI logs.
- **CI/CD uses GitHub OIDC** federation to assume an AWS role — there are
  no long-lived AWS access keys in GitHub secrets. The only GitHub
  Actions secret is `SANITY_AUTH_TOKEN` (studio deploy), which is a
  scope-limited "Deploy Studio" token, not an admin token.
- `.claude/settings.json` is committed (the rest of `.claude/` is
  gitignored — see `.gitignore`) and ships a project-wide deny-list of
  destructive commands: AWS resource deletion (S3, CloudFront, Lambda,
  IAM, KMS, Route 53, ACM, DynamoDB, CloudWatch Logs, Budgets), force
  pushes, hard resets, `terraform apply/destroy`, `gh secret set`,
  `gh release create`, `gh workflow run`, and the studio deploy
  variants. Operators using Claude Code in the project inherit the
  deny-list automatically.

**Residual risk:**
- **An AWS credential with `kms:Decrypt` on the project key is a
  plaintext secret equivalent.** If an IAM access key with those
  permissions leaks, the attacker can decrypt everything in the repo.
  Mitigation: MFA on the AWS console account, short-lived credentials
  where possible, scoped IAM policies that only grant decrypt to
  identities that genuinely need it, CloudTrail alerting on unusual
  decrypt patterns.
- **The Sanity API token is Editor-scope, not order-only.** The token
  baked into both the main backend Lambda env and the daily auto-cancel
  Lambda env grants read + write across the entire Sanity dataset,
  not just the ability to patch `status` on `order` documents. A
  compromised Lambda runtime could delete or modify any Sanity document
  (products, gallery, testimonials). Sanity does not currently offer a
  finer-grained token scope (per-document-type write); this is a
  platform constraint, not a project gap. The auto-cancel Lambda's
  trust boundary (no DynamoDB / Resend / PayFast access) still
  meaningfully reduces blast radius compared to the main backend
  runtime.
- **Loss of AWS account access is catastrophic to this project** — both
  the secrets AND the Terraform state bucket AND the running
  infrastructure are gone. Mitigation is AWS account recovery hygiene:
  MFA with backup codes stored physically, a verified recovery email, a
  second admin user or role configured. This is outside the repo.
- Resend and Sanity dashboard credentials are outside AWS's blast radius
  and need their own MFA.
- **Encrypted files in git history survive rotation.** If a secret leaks
  and you rotate it, the old value is still readable by anyone with
  `kms:Decrypt` on the project key — but the new value in the current
  commit is different. Git history of rotated secrets is therefore only
  useful to an attacker who also has KMS access, which is the same
  trust boundary as the latest commit. Not a separate risk.

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
- **Scheduled `pnpm audit`** (`.github/workflows/audit.yml`) runs every
  Monday at 06:00 UTC and on manual dispatch, scanning all workspaces at
  `--audit-level=moderate`. Findings open a `dependency-audit`-labelled
  GitHub issue; the next clean run auto-closes it.
- Dependabot is configured (grouped weekly updates per workspace) — see
  the roadmap.

**Residual risk:**
- `pnpm audit`'s vulnerability database lags GHSA/NVD by hours-to-days for
  newly-disclosed CVEs. For zero-day-class issues, manual response from
  GitHub Security alerts is the faster signal.
- Audit only catches *known* CVEs — supply-chain attacks via compromised
  packages with no published advisory pass through. Risk mitigated by
  `pnpm-lock.yaml` and only running `--frozen-lockfile` in CI/deploy
  workflows.
- **Dependabot security updates** are enabled at the repo level, so
  PRs for new advisories are opened as soon as GitHub picks them up —
  outside the weekly Dependabot cadence configured in
  `.github/dependabot.yml`.

---

### 10. PayFast payment integrity

| | |
|---|---|
| **Likelihood** | low |
| **Impact** | medium |

**What could happen:** An attacker submits a tampered order with a lower
amount, or forges an ITN callback to mark an unpaid order as paid.

**Current mitigations:**
- **Server-side amount computation**: the backend looks up product prices
  in Sanity and computes the total — the client never submits the amount.
  Prevents price-tampering attacks.
- **ITN signature verification**: the PayFast ITN callback is validated
  against `PAYFAST_PASSPHRASE` using the standard PayFast MD5 signature
  scheme. Forged callbacks fail validation.
- **Amount cross-check**: the ITN handler compares `amount_gross` against
  the `amountZar` stored on the Sanity order document. Mismatches are
  rejected.
- **Idempotency guard**: the ITN handler checks the order's current status.
  If it's already past `pending_payment`, the ITN is silently ignored —
  preventing double-processing.
- **No card data on our server**: the PayFast redirect model means card
  numbers never touch our infrastructure. PCI compliance scope is SAQ A
  (the lowest tier).

**Residual risk:**
- If `PAYFAST_PASSPHRASE` leaks, an attacker can forge ITN callbacks.
  Rotate by updating the passphrase in both PayFast's dashboard and
  `infra/terraform.tfvars.sops`, then `terraform apply`.
- PayFast's MD5 signature scheme is weaker than HMAC-SHA256 (used for
  Sanity webhooks). This is PayFast's standard protocol — not something
  we can change.

---

### 11. Vulnerabilities in our own code (SAST)

| | |
|---|---|
| **Likelihood** | low–medium |
| **Impact** | varies (XSS, SSRF, prototype pollution, hard-coded secrets) |

**What could happen:** A handler we write contains a vulnerability that
isn't a known dependency CVE — for example, untrusted input flowing into
a render path that produces unescaped HTML, an unbounded outbound fetch
in the contact form, or a credential accidentally committed to source.
This is the same class of bug that hit `hono` in CVE-2026-44458 (CSS
injection in JSX `style` rendering): no advisory until someone finds it.

**Current mitigations:**
- **CodeQL** (`.github/workflows/codeql.yml`) runs the
  `security-and-quality` query suite on every PR to `main`, every push
  to `main`, and on a weekly cron (Sunday 06:00 UTC). Two matrix legs:
  `javascript-typescript` covers backend / frontend / studio, and
  `actions` covers the workflow YAML itself (workflow-injection sinks,
  unpinned action references). Findings surface in the repo's Security
  tab under "Code scanning alerts" with line-level annotations on the
  PR diff.
- **gitleaks** (`.github/workflows/gitleaks.yml`) regex-scans the
  working tree on every PR + push to `main`, and the entire git
  history on a weekly cron (Monday 06:00 UTC). Catches stray pastes of
  AWS keys, Sanity API tokens, Resend keys, PayFast passphrase, admin
  tokens — anything matching the gitleaks default ruleset.
- **OpenSSF Scorecard** (`.github/workflows/scorecard.yml`) measures
  branch-protection, action-pinning, vulnerability-management posture,
  etc. against an OpenSSF-maintained rubric. Weekly cron, advisory
  only — drops are usually a 30-second triage, not a blocker.
- **Trivy IaC scan** (`.github/workflows/terraform.yml`) runs the
  tfsec-derived config ruleset across `infra/` on every PR + push that
  touches the stack. Flags public S3 buckets, IAM `Action: *`,
  missing encryption-at-rest, and similar known-bad patterns before
  `terraform apply`.
- **GitHub-native secret scanning + push protection** are enabled at
  the repo level — pushes containing recognised provider tokens
  (AWS keys, GitHub PATs, etc.) are rejected at the API.
- **Type-checking** via `pnpm check` (tsc + svelte-check) on every
  PR catches whole classes of bug that would otherwise reach
  CodeQL — type mismatches, null-deref, etc.

**Residual risk:**
- CodeQL's JS/TS queries are strong for Node and React but coverage
  for `.svelte` files is best-effort. Logic that lives entirely inside
  `<script>` blocks of components is scanned; template-only data flows
  may not be. Most of our security-relevant code lives in the backend
  (`backend/src/`), which is plain TypeScript and fully covered.
- gitleaks catches *patterns* — a high-entropy custom-format token
  (e.g. an internal HMAC key encoded as base64url) may pass the default
  ruleset unflagged. Repository-wide push protection at the GitHub
  level catches the providers we care about most.
- Trivy IaC scans known-bad patterns — a logically-insecure but
  syntactically-clean construct (overly broad bucket policy that
  passes the ruleset) needs manual review.
- SAST finds patterns it knows. Novel vulnerabilities and logic bugs
  (e.g. the ITN amount mismatch class in risk 10) need manual review.

---

## What this site explicitly does not protect against

Documenting the non-goals so they're not mistaken for gaps:

- **Nation-state or targeted attacks.** The threat model is
  "opportunistic bots + small-scale fraud." A determined adversary with
  meaningful resources will get through.
- **Account takeover of customer accounts.** There are no customer
  accounts.
- **Card fraud beyond PayFast's protections.** PayFast handles fraud
  detection and chargebacks for card payments. We rely on their
  PCI DSS Level 1 certified infrastructure.
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
6. **IAM credential with `kms:Decrypt` leaked.** (e.g. an AWS access key
   pair for your operator user showed up in a public place, or a role's
   temporary credentials were exfiltrated.)
   - Revoke the credential immediately — deactivate the access key in the
     IAM console, or `aws iam update-access-key --status Inactive`.
   - Pull CloudTrail to see what the credential actually did: every
     `Decrypt` call against the project KMS key is logged.
     ```bash
     aws cloudtrail lookup-events \
       --lookup-attributes AttributeKey=EventName,AttributeValue=Decrypt \
       --region af-south-1 --max-results 50
     ```
     Filter for events whose `resources` includes the project key ARN and
     whose source IP / user agent looks suspicious.
   - If the attacker could have decrypted the SOPS files during the
     exposure window, treat every secret in `infra/terraform.tfvars.sops`
     and `backend/.env.sops` as leaked. Rotate all of them in their source
     dashboards (Resend, Sanity API token, Sanity webhook secret).
   - Update the values via `sops infra/terraform.tfvars.sops` and `sops
     backend/.env.sops`, then `terraform apply`.
   - Optionally also rotate the KMS key itself by creating a new key and
     updating the alias (see `docs/deployment.md § Rotating the KMS key`).
     Not strictly required — the leaked credential can't grant itself new
     permissions — but a defence-in-depth move.
7. **AWS account compromised.** (Not just one credential — the whole
   account.) This is a major incident; treat the project's KMS key as
   owned by the attacker.
   - Regain control of the AWS account via AWS account recovery (phone
     verification, support ticket if needed).
   - Once back in, rotate every IAM credential in the account, enable
     MFA on the root user if not already, audit CloudTrail for the full
     exposure window.
   - Rotate every secret in the repo at its source dashboard.
   - Create a new KMS key (or rotate the existing one as in deployment.md),
     re-encrypt the SOPS files, commit.
   - Run `terraform apply` to push the new values.
   - Consider whether the infrastructure itself was tampered with
     (Lambda code, S3 bucket contents, IAM policies) and reprovision as
     needed.
8. **Lost AWS account access entirely** (account closed, recovery failed).
   - The encrypted files in git are no longer recoverable by you — they
     were encrypted under a KMS key you no longer control. This is a
     recovery incident, not a security incident (the secrets are not
     leaked, they're just no longer readable by you).
   - Regenerate every secret from its source dashboard (Resend, Sanity).
   - Create a new AWS account, run `bin/sops-init.sh` to provision a
     fresh KMS key, fill in the encrypted files with the new values.
   - Commit. Run the full `bin/setup.sh` to re-provision infrastructure
     under the new account.
   - Total downtime depends on how long AWS account creation takes and
     DNS propagation — typically 1–2 hours.

---

## PII retention (POPIA Section 14)

Customer PII is stored in a private AWS DynamoDB table
(`meryl-green-designs-orders`, hash key `orderRef`): `customerName`,
`customerEmail`, `customerPhone`, `shippingAddress`, `items`,
`customerNotes`, `trackingNumber`, `trackingUrl`, `shippingCarrier`, and
the operator-only `internalNotes`. The Sanity order document is
PII-free post-Phase-1 — it holds only the non-PII skeleton
(`orderRef`, `status`, `paymentMethod`, `amountZar`, `paymentId`).

### The policy

- **Retention window**: 365 days from order creation, applied to the
  DynamoDB row only. The Sanity skeleton (no PII) is kept indefinitely
  for SARS audit, dispute resolution, and revenue accounting.
- **What gets cleared**: every PII attribute on the DynamoDB row goes
  with the row itself when the TTL fires — the row is deleted, not
  patched.
- **What's preserved**: the matching Sanity skeleton (`orderRef`,
  `status`, `amountZar`, `paymentMethod`, `paymentId`, `_createdAt`).
  Sufficient for tax/accounting; insufficient for re-identifying the
  customer.
- **Declared in the public privacy policy** at
  `frontend/src/routes/privacy/+page.svelte` § "How long we keep it".
  Required by POPIA — the retention period must be visible to the data
  subject, not only documented internally.

### Automated enforcement

DynamoDB per-item TTL handles this with no Lambda involvement. Each
row written by `orders-store.ts:writeOrderPii` carries a `ttl`
attribute set to `createdAt + 365 days` (Unix seconds). AWS sweeps
expired items asynchronously — typically within 48 hours of the TTL
timestamp, never longer than 4 days.

The TTL attribute and its enabled flag are declared in
`infra/dynamodb.tf`:

```hcl
ttl {
  attribute_name = "ttl"
  enabled        = true
}
```

There is no operator action required for the routine case. No Lambda
schedule, no monthly cron, no manual sweep. The pre-Phase-1
`backend/src/pii-cleanup.ts` Lambda + EventBridge schedule that did
this on Sanity is gone — the move to DynamoDB replaced it with
storage-layer enforcement that can't drift or fail silently.

### Verifying it works

DynamoDB exposes TTL metrics in CloudWatch under the
`AWS/DynamoDB` namespace — the relevant one is
`TimeToLiveDeletedItemCount`. Expect a non-zero count starting ~365
days after the table received its first PII row. Before that window,
the count is zero because nothing has aged out yet.

Spot-check by:

```bash
AWS_REGION=af-south-1 aws dynamodb scan \
  --table-name meryl-green-designs-orders \
  --filter-expression '#t < :cutoff' \
  --expression-attribute-names '{"#t":"ttl"}' \
  --expression-attribute-values "{\":cutoff\":{\"N\":\"$(date +%s)\"}}" \
  --no-cli-pager
```

A non-empty result for items whose `ttl` is in the past indicates AWS
hasn't reaped them yet — that's normal up to ~4 days. A persistent
result older than a week means TTL is disabled or misconfigured —
check the table in the AWS console under **Additional settings → TTL**.

### Manual fallback

If TTL is disabled or a specific record needs deleting ahead of its
scheduled expiry (e.g. a deletion request under POPIA s24), use the
AWS CLI:

```bash
AWS_REGION=af-south-1 aws dynamodb delete-item \
  --table-name meryl-green-designs-orders \
  --key '{"orderRef":{"S":"MG-260413-AB12"}}' \
  --no-cli-pager
```

This removes the PII row. The matching Sanity skeleton stays — that's
deliberate (the orderRef + status + amount are accounting data, not
PII). If the customer also wants the Sanity skeleton gone, delete the
document from Studio after confirming the deletion request is a
legitimate POPIA s24 request from the actual data subject.

Note for old orders: orders that pre-date Phase 1 had PII fields
populated directly on the Sanity document. The `scrub-sanity-pii.ts`
script that ran at Phase 1 cutover patched all of those to `null`, so
no current Sanity doc holds PII regardless of age. If you ever find
one with a populated `customerName` / `customerEmail` etc., re-run
`pnpm scrub:sanity-pii --prod --yes` — that's the recovery procedure.

---

## Known hardening gaps (roadmap items)

Captured here so they don't get lost:

- **Dedicated sender domain with DMARC/SPF/DKIM** for the outbound Resend
  email identity, to make impersonation harder outside the repo.
- **Signed tokens on tracking URLs** instead of email-in-querystring. Low
  priority.
- **AWS WAF in front of CloudFront** for distributed-attacker
  rate limiting (the in-memory limiter only caps per-instance). Out of
  scope at current volume; revisit if real attack traffic appears.

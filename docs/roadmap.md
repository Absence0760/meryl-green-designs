# Roadmap

This document tracks what's built, what's left before launch, and what's
planned for later. Items move between sections as they're shipped.

## Status at a glance

**The app is code-complete for v1.** Every feature in the original client
brief (home with hero + story + poem, gallery, shop with PayFast checkout,
customer order tracking, CMS) is built. All three workspace packages typecheck
clean and build clean. Deployment is a single command (`bin/setup.sh`).

What's actually pending is divided into two buckets:

1. **One-time external setup** — accounts, DNS, running the setup script,
   Meryl adding content. All documented in [`deployment.md`](./deployment.md).
2. **Nice-to-haves** — performance polish, editorial improvements, optional
   features Meryl may or may not want.

Nothing structural is missing and no work is blocked.

## What's been built (the whole "done" list)

This is here so the rest of the roadmap has context and so you can see how
much of the brief is already shipped.

### Core site
- [x] Home page with hero photograph, story, and poem
- [x] Gallery page (Sanity-backed, client-side loading with skeletons)
- [x] Shop page with Sanity-backed product catalogue
- [x] Contact page
- [x] Order form → Sanity order document → owner + customer emails
- [x] Customer order tracking page at `/track`
- [x] Automated customer status emails on order status changes
- [x] Under-construction banner removed

### Content management
- [x] Sanity Studio with four schemas: `product`, `galleryPhoto`, `testimonial`, `order`
- [x] Product reads routed through the backend (so the dataset can stay private)
- [x] Gallery reads routed through the backend (same pattern)
- [x] Order creation writes to DynamoDB (PII) + Sanity (non-PII skeleton);
      see [Split order PII](#longer-term--speculative) (now landed) and
      [`docs/orders-pii-split-plan.md`](./orders-pii-split-plan.md)

### Polish
- [x] Favicon (brand-colored SVG)
- [x] `robots.txt` with `/track` disallowed
- [x] Per-route `<title>`, meta description, Open Graph, Twitter Card tags
- [x] Hero image compressed (3.6 MB → 643 KB via `sips`)
- [x] Client-side loading with skeleton states on shop + gallery (page shell
      appears instantly; data loads and images lazy-load progressively)
- [x] `loading="lazy"` on all shop and gallery images
- [x] Product cards aligned so buttons stay on the same baseline regardless
      of blurb/description length
- [x] `prefers-reduced-motion` guard on the skeleton shimmer animation
- [x] Hero `rel="preload"` hint
- [x] `theme-color` meta for mobile address-bar tinting

### Infrastructure
- [x] Monorepo restructured into `frontend/`, `backend/`, `studio/`, `infra/`
- [x] Terraform module for S3, CloudFront, OAC, ACM cert, Route 53,
      Lambda, IAM, GitHub OIDC
- [x] Three GitHub Actions deploy workflows (frontend, backend, studio)
      with OIDC federation — no long-lived AWS keys in secrets
- [x] Release-gated deploys: each deploy workflow fires only when a
      GitHub release is published (not on every push to `main`), with a
      skip-if-unchanged check job that compares the current release tag
      against the previous one and skips deploys for workspaces whose
      files didn't change. `workflow_dispatch` is retained as an escape
      hatch for manual re-runs, and the frontend also listens for
      `repository_dispatch: sanity-publish` so content edits rebuild
      without a code release.
- [x] Secrets management via SOPS + AWS KMS. `infra/terraform.tfvars.sops`
      and `backend/.env.sops` are committed encrypted, decryptable by
      anyone with `kms:Decrypt` on the project's dedicated KMS key
      (`alias/meryl-green-designs-sops` in `af-south-1`). `bin/sops-init.sh`
      bootstraps the KMS key idempotently; `bin/setup.sh` decrypts tfvars
      into a scratch file at start and shreds it on exit. See
      `docs/deployment.md § Secrets management`.
- [x] `bin/setup.sh` one-command bootstrap (state bucket, `terraform apply`,
      GitHub Actions variables, Sanity dataset privacy, backend webhook)
- [x] `bin/sops-init.sh` one-command SOPS bootstrap (KMS key creation,
      `.sops.yaml` placeholder substitution, encrypted-file seeding)
- [x] Dependabot configured with grouped weekly updates for all three
      workspace packages + GitHub Actions
- [x] Backend Lambda bundling via esbuild
- [x] Backend env loading via `dotenv` for local dev (stripped from the
      Lambda bundle via entry-point isolation — `lambda.ts` deliberately
      does not import `server.ts`)

### Testing
- [x] **End-to-end Playwright suite** (`playwright/` workspace) — drives
      Chromium against the live backend + frontend + LocalStack
      DynamoDB + a dedicated `test-e2e` Sanity dataset. Covers
      smoke renders of every public page, the cart + checkout dual-write
      (DynamoDB PII row + Sanity skeleton + owner email + signed PayFast
      form), `/track` lookups (happy + no-enumeration paths), PayFast
      ITN simulation (COMPLETE / FAILED / invalid sig / amount mismatch),
      and the Sanity status webhook. Runs on every PR + push to `main`
      via `.github/workflows/e2e.yml`. **Cannot touch production** — the
      env-guard in `playwright/global-setup.ts` aborts if any env var
      would target a real resource (Sanity production dataset, non-loopback
      DynamoDB endpoint, EMAIL_BACKEND≠file, PAYFAST_SANDBOX≠true).
- [x] Vitest test suite across backend and frontend (334 tests total: 310
      backend across 18 files + 24 frontend across 3 files, ~4s combined).
      Backend covers email templates + HTML escaping, `sendEmail` with
      mocked Resend fetch, Sanity webhook HMAC verification, PayFast
      ITN signature verification + amount checks + failed-ITN dedup,
      `POST /orders` + dual-write rollback semantics + `GET /orders/:ref`
      + retry-payment, `/enquiries`, `/admin/*` PII routes + admin-auth
      middleware, `/products` + `/gallery` + `/testimonials`, CORS
      (including `ALLOWED_ORIGINS` fallback behaviour), rate-limit
      middleware, `/health`, 404 handling, orders-store join layer,
      auto-cancel sweep, and a regression guard that fails if banking
      details ever reappear in the automated pending-payment email.
      Frontend covers `formatPrice`, `imageUrl`, and the cart logic
      helpers. All tests mock Sanity, Resend, and DynamoDB so they run
      offline. Root `pnpm test` runs both workspaces.
- [x] CI workflow (`.github/workflows/ci.yml`) runs `pnpm check` + `pnpm
      test` on every PR and every push to `main`/`dev`, with
      cancel-in-progress concurrency so rapid pushes don't stack up.

### Developer experience
- [x] All dependencies upgraded to latest major versions (Svelte 5,
      SvelteKit 2.59, Vite 8, TypeScript 6, Sanity 5, React 19, Hono 4.12,
      @sanity/client 7, etc.)
- [x] Dead boilerplate dependencies removed (Storybook, `unplugin-icons`,
      `mdsvex`, `normalize.css`, `isomorphic-dompurify`)
- [x] `$app/stores` → `$app/state` migration so the layout compiles cleanly
      under Svelte 5's strict rune rules
- [x] `pnpm dev` runs frontend + backend in parallel with HMR
- [x] Clean typecheck + build across all three packages

### Documentation
- [x] `docs/architecture.md` — full system overview with flow diagrams
- [x] `docs/features.md` — per-page feature list
- [x] `docs/run-locally.md` — local dev setup walkthrough
- [x] `docs/deployment.md` — deployment guide with release-gated workflow,
      SOPS + KMS secrets management, env var reference, rollback,
      troubleshooting, and "adding a new content type" playbook
- [x] `docs/orders-and-tracking.md` — detailed order flow
- [x] `docs/security.md` — cross-cutting risk register, mitigations,
      incident playbook, hardening gaps (rate limiting, `pnpm audit`,
      order-ref entropy, DMARC/SPF)
- [x] `infra/README.md` — Terraform module reference
- [x] `CLAUDE.md` — repo guidance loaded into every Claude Code session
- [x] Root `README.md`

## Remaining before launch

These are the things that actually block flipping the switch to live
traffic. Most are external, and each is documented with exact steps in
[`deployment.md`](./deployment.md).

### Content (needs Meryl)
<!-- Removed 2026-05-15: EFT/manual-payment path no longer exists on
     the site — PayFast is the only checkout route, so there is no
     reply-with-banking-details flow to support. If a manual-payment
     path is ever reintroduced, restore this item along with the
     security.md § Risk 1 impersonation mitigation. -->

- [x] Real contact details on `frontend/src/routes/contact/+page.svelte`:
      - [x] real email — `zagreenwoman@gmail.com` (confirmed by Meryl 2026-04-16)
      - [x] phone number — `082 326 4555` (confirmed by Meryl 2026-05-15,
            supplied as the business contact number alongside the ECT s43
            details; mirrored on `/returns` for the s43 disclosure).
      - [x] studio location — "Based in the Western Cape, South Africa.
            Shipped nationwide." (confirmed by Meryl 2026-05-13). A
            specific town would be friendlier but is not blocking.
- [ ] Meryl populates the shop with real products via Sanity Studio
- [ ] Meryl populates the gallery with real photos via Sanity Studio
- [x] **ECT Act s43 business identification** for the Returns page
      (the section that satisfies ECT Act s43's disclosure
      requirements for online retailers). Meryl confirmed on
      2026-05-15: registered name `Meryl Green Designs`, sole
      proprietor, physical address `Unit 2 Nordyk Park, Commercial
      Street, Malmesbury, 7300`, telephone `082 326 4555`, no
      CIPC registration number (not required for sole proprietors).
      Disclosure block now lives in the "About Meryl Green Designs"
      section of `frontend/src/routes/returns/+page.svelte`. Still
      needs the legal-reviewer pass below — values to be sanity-checked
      against any registration documents Meryl holds.
- [ ] South African legal professional reviews the three policy pages
      before they go live: `frontend/src/routes/privacy/+page.svelte`
      (POPIA wording, cross-border transfer language, retention periods),
      `frontend/src/routes/returns/+page.svelte` (CPA windows, courier
      SLAs, the ECT s43 disclosure once Meryl fills it in), and
      `frontend/src/routes/terms/+page.svelte` (governing-law clause,
      lead-time numbers, CPA s51 limitation scope). Each page's header
      comment lists the specific items the reviewer must confirm.
- [ ] **Information Officer registration with the Information
      Regulator.** Meryl is named in the Privacy Policy as the
      Information Officer under POPIA s55. POPIA also requires the IO
      to be registered with the Information Regulator via the online
      portal at inforegulator.org.za. The page-level designation alone
      is not enough; the portal registration is a separate compliance
      step Meryl needs to complete before launch. Concrete steps:
      (1) Create an account on the Information Regulator's
      eServices portal at https://eservices.inforegulator.org.za
      (the older `registrations.inforegulator.org.za` portal was
      retired in May 2024 — make sure to use the eServices URL).
      Account creation needs a business email + South African ID
      number.
      (2) Submit the Information Officer registration form for
      Meryl Green Designs as a sole proprietor with Meryl as both
      responsible party and IO.
      Required fields: full business name (`Meryl Green Designs`),
      legal status (Sole Proprietor), physical address (`Unit 2
      Nordyk Park, Commercial Street, Malmesbury, 7300`), telephone
      (`082 326 4555`), and IO contact email (currently
      `zagreenwoman@gmail.com`; if the domain mailbox below is
      provisioned first, register that instead).
      (3) Save the IR confirmation reference; the Information Officer
      registration number can be added to the Privacy Policy header
      once issued.
- [ ] **Optional — affirmatively execute the click-through DPAs on
      each operator's dashboard.** Sanity, Resend, and AWS each
      publish a DPA that is incorporated by reference into the
      standard ToS we accepted at signup, so the POPIA s21 "written
      agreement" requirement is already met (and the Privacy Policy
      now describes it that way). The dashboard click-through is a
      belt-and-suspenders move for audit posture — useful if an IR
      enquiry ever asks for executed PDFs, but not a launch
      blocker. Concrete steps if pursued:
      (1) **Sanity** — log in at https://www.sanity.io/manage,
      open the project, Settings → Compliance → Data Processing
      Agreement, accept on the current plan tier. Free-tier
      accounts surface this as a click-to-accept; download the
      executed PDF for the records folder.
      (2) **Resend** — log in at https://resend.com/settings,
      Compliance → Data Processing Agreement, accept and download.
      (3) **AWS** — sign in to the AWS account that hosts the
      af-south-1 stack, Account Settings → AWS Artifact (or
      https://console.aws.amazon.com/artifact/), search for "GDPR
      Data Processing Addendum", click Accept Agreement. Download
      the signed PDF for the records folder.
      Keep all three PDFs in a private SOPS-encrypted folder
      alongside the existing tfvars; do not commit plaintext.
- [ ] **Optional — domain mailbox to replace the personal Gmail.**
      The Privacy Policy uses `zagreenwoman@gmail.com` for Information
      Officer requests, claims handling, and general contact. POPIA
      doesn't prescribe an email format for the IO contact, so this
      is not a compliance gate — but a business-domain mailbox
      reduces the chance that data-subject requests get lost in a
      personal inbox (or are dropped if the Gmail account is ever
      suspended) and looks more professional to the Regulator and
      CGSO. Options that fit a
      single-user sole-proprietor budget (mailbox-only, no other
      productivity tooling needed since Meryl uses Gmail personally):
        - **Zoho Mail Mail Lite** (~R30/user/month) — 10 GB
          storage, custom domain, web + IMAP. Cheapest credible
          option for SA.
        - **Google Workspace Business Starter** (~R150/user/month)
          — full Workspace; overkill for a single mailbox but
          familiar UX if Meryl already lives in Gmail.
        - **Resend Inbound** (free up to 1k messages/month at the
          time of writing) — re-uses the already-verified
          `merylgreendesigns.com` DNS for SPF/DKIM, but Resend
          Inbound is primarily for transactional / webhook use,
          not for browsing email day-to-day. Probably *not* the
          right fit for a human inbox.
      Recommended: Zoho Mail Lite. Naming scheme: `meryl@<domain>`
      as the primary mailbox, with `privacy@`, `support@`, and
      `legal@` set up as aliases that forward to the primary so
      data-subject requests, claims, and general queries land in
      one inbox without three separate logins. Update the Privacy
      Policy (`Who we are` + `Contact us` sections), Returns page
      s43 disclosure block, Terms `Who you are contracting with`,
      and Contact page once the mailbox is live.
- [x] **Clickwrap acceptance checkbox at checkout.** Required
      checkbox added to the cart submit step (`frontend/src/lib/Cart.svelte`)
      linking to /terms, /returns, /privacy. The Pay button is
      disabled until the box is ticked, and `handleCheckout` blocks
      submit with an error message if it's empty — defence-in-depth
      against the disabled-attribute being bypassed via DOM
      manipulation.
- [x] **Auto-cancel stale `pending_payment` orders.** Daily
      EventBridge-scheduled Lambda (`backend/src/auto-cancel-lambda.ts`)
      at 06:00 UTC scans Sanity for `pending_payment` orders older
      than `AUTO_CANCEL_DAYS` (default 30) and patches them to
      `cancelled`. The status patch trips the existing Sanity webhook
      which then fires the cancellation email to the customer. Trust
      boundary kept tight: Sanity write token only, no DynamoDB /
      Resend / PayFast surface from this Lambda. Infra in
      `infra/auto_cancel.tf`; logic + unit tests in
      `backend/src/auto-cancel.ts` and `__tests__/auto-cancel.test.ts`.
- [x] **Order-confirmation email subject-line audit.** Verified —
      `pendingPaymentTemplate` already used "Order received" in its
      subject; `paymentReceivedTemplate` subject + heading updated
      from "Payment received" to "Order confirmed" so the email that
      arrives after the ITN matches the contract-trigger wording the
      Terms quote. Regression-guarded in `backend/src/__tests__/email.test.ts`
      (asserts both literal strings).

### External accounts
- [ ] Resend account with verified sending domain (DNS propagation wait
      is typically 5–30 min)
- [ ] Sanity: set `production` dataset visibility to **Private** in the
      dashboard, or let `bin/setup.sh` do it by providing `SANITY_ADMIN_TOKEN`
- [ ] AWS account with `af-south-1` region enabled (opt-in regions need a
      manual click)
- [ ] Domain registered + Route 53 hosted zone existing

### Deployment
- [ ] Run `./bin/sops-init.sh` to provision the project's KMS key and seed
      encrypted `infra/terraform.tfvars.sops` + `backend/.env.sops` from
      the examples
- [ ] Fill in real values: `sops infra/terraform.tfvars.sops` and `sops
      backend/.env.sops`
- [ ] Run `./bin/setup.sh` (one command, ~15 min of which is CloudFront
      propagation)
- [ ] Cut the first GitHub release to trigger the release-gated deploy
      workflows:
      ```bash
      gh release create v0.1.0 --generate-notes --target main
      ```
      This fires `deploy-frontend`, `deploy-backend`, and `deploy-studio`
      in parallel. The first release has no previous tag so all three
      workspaces deploy regardless of the skip-if-unchanged check.
- [ ] Run `pnpm studio deploy` once locally (interactive first-time only)
- [ ] Add `SANITY_AUTH_TOKEN` GitHub Actions secret for CI studio deploys
- [ ] Create the content-rebuild Sanity webhook via the dashboard (needs
      a GitHub fine-grained PAT that can't be automated from `gh`)

### Pre-launch verification
- [ ] End-to-end order flow test with a real Resend account (see
      `deployment.md` § End-to-end verification)
- [ ] Run Lighthouse on the live site and address any critical findings
- [ ] Test on a real phone (touch targets, form keyboards, scroll behavior)

## Near-term post-launch

Nice-to-haves worth doing once the site is live and Meryl has real feedback.
None are blocking; pick the ones that match observed pain.

- [ ] Compress the hero further with a dedicated tool (mozjpeg / squoosh)
      — currently 643 KB, could realistically hit ~200 KB
- [ ] Responsive `srcset` on shop and gallery images for better mobile
      performance
- [ ] Low-quality image placeholder (LQIP) blur-up loading for smoother
      image appearance
- [ ] Extend the CMS to cover home page story, poem, and hero photo so
      Meryl can edit those without a dev
- [x] Rate limiting on `POST /orders`, `GET /orders/:ref`, and the two
      webhook endpoints — per-IP fixed-window in-memory limiter
      (`backend/src/rate-limit.ts`)
- [x] **Self-service payment retry.** `POST /orders/:ref/retry-payment`
      re-signs a PayFast form for the same `orderRef`, gated by the
      shared `emailsMatch` helper, a status guard, a 7-day window, and
      an atomic DynamoDB lifetime cap of 5 attempts (the cap sits
      AFTER the auth checks so a distributed attacker can't burn
      slots with wrong-email attempts — documented deviation from the
      design). A failed PayFast ITN triggers a "didn't go through"
      email with retry instructions (Option A); the email links to
      `/track?ref=X` without the email param to avoid Referer-leak on
      forwarding. Frontend surfaces: `/payment/cancelled` retry form
      and a retry CTA on `/track` for in-window pending orders.
      **Full implementation notes:**
      [`docs/payment-retry-plan.md`](./payment-retry-plan.md).
- [x] Structured product picker on the order form — cart submits
      `{productId, quantity}[]` to the backend; backend validates
      against Sanity and computes price server-side (no free-form
      items textarea). Shipped with the Cart panel rewrite.
- [ ] **Self-service order-reference recovery / resend-confirmation
      email.** Today `/track` requires both the order reference and
      the email-on-file. A customer who lost their order email (bounce,
      spam, mistyped address at checkout) and closed the tab before
      `/payment/complete` rendered has no self-service path — only
      the `/contact` page, which has just been wired up as a cheap
      manual fallback. Build a `POST /orders/resend-confirmation`
      endpoint that takes only an email address, looks up that email
      in DynamoDB, and re-fires the existing `pendingPaymentTemplate`
      or `paymentReceivedTemplate` (whichever matches the current
      order status) back to the address on file. **Threat-model
      constraints — same shape as the existing
      `POST /orders/:ref/retry-payment` work in
      `docs/payment-retry-plan.md`**:
        - Must not be an email-enumeration oracle: respond identically
          whether the email matches an order or not (HTTP 200 with a
          generic "if we have an order matching that email, we've
          sent a copy"). Never differentiate via status code, response
          body, or timing.
        - Rate-limited per-IP with the existing
          `backend/src/rate-limit.ts` helper. 5 per minute is the
          ballpark used by other public POSTs.
        - Lifetime cap of N resends per email (DynamoDB atomic
          increment, mirrors the retry-payment cap pattern) to
          prevent inbox spam if an attacker drives the endpoint.
        - Refuse for orders older than X days (matching the 365-day
          TTL or shorter) so an attacker can't trawl stale records.
      Frontend surfaces would be a "Lost your order email? Re-send it"
      form on `/track` (replacing the manual `/contact` fallback this
      commit landed) and possibly a link in the post-payment surfaces.
      **Ship with e2e coverage** in
      `playwright/tests/orders/`: cases for (a) valid email → owner
      receives one resent email (and the captured-emails file
      reflects it), (b) unknown email → identical response with no
      email sent, (c) rate-limit triggers on the Nth call within the
      window, (d) lifetime cap refuses past N successful resends.
      Mirror the assertion shape from the existing
      `payment-retry.spec.ts`. Counts as a payment-adjacent surface
      so the implementation deserves a `/safe-edit` cycle, not a
      normal edit.
- [ ] "About Meryl" page
- [ ] Archive of past / sold products
- [ ] Newsletter signup (only if Meryl wants it)
- [ ] Lambda alias for cleaner one-command rollback (right now rollback is
      via "re-run the previous workflow"; works but an alias is tidier)
- [x] Sitemap.xml generator — `frontend/src/routes/sitemap.xml/+server.ts`
      renders the discoverable routes at build time.

## Longer-term / speculative

Only build these if there's a concrete reason. Each represents a meaningful
step up in complexity and shouldn't be taken lightly.

- [x] Card payments via PayFast — redirect integration supporting credit
      cards, Apple Pay, Google Pay, SnapScan, and 18+ other methods.
      No PCI scope for us (redirect model). ITN webhook auto-confirms
      payments in Sanity. EFT removed.
- [ ] Inventory tracking with real stock counts — requires a database. The
      current `available` boolean works for made-to-order and one-offs.
- [ ] Multi-language (English + Afrikaans) — adds routing, content
      translations, and duplicated CMS fields.
- [ ] Integration with a shipping provider for live tracking (Courier Guy,
      Aramex, etc.) — right now Meryl pastes the tracking number into the
      order document by hand.
- [ ] Order admin dashboard for Meryl — marked promoted earlier but in
      practice the Sanity Studio IS this dashboard, so the item is moot
      unless she outgrows Studio's list view.
- [x] **Split order PII out of Sanity into AWS DynamoDB.** **Live since
      2026-05-13** — Phase 1 cutover landed. Customer PII (name, email,
      phone, address, items, notes, tracking) now lives in DynamoDB;
      the Sanity order document carries only the non-PII skeleton
      (orderRef, status, paymentMethod, amountZar, paymentId). Meryl's
      Studio workflow is preserved via three custom React panels
      (`CustomerDetailsPanel`, `TrackingFields`, `InternalNotesField`
      in `studio/components/orderPii.tsx`) that fetch PII through the
      `/admin/orders/:ref/*` backend routes. Saves ~R285/month by
      dropping the Sanity Growth subscription and reduces the set of
      third-party PII processors. **Implementation history:**
      [`docs/orders-pii-split-plan.md`](./orders-pii-split-plan.md).

## Explicit non-goals

Things we deliberately will not build unless the business case changes
materially.

- **Customer accounts / login.** The site is small and order tracking is
  key-based (ref + email). Accounts would be friction for no gain.
- **Real-time chat / live support.**
- **A mobile app.** Everything important works in a mobile browser.
- **Marketplace features.** Only one seller, not a platform.
- **Bank API integration for direct payouts / reconciliation.** PayFast
  already auto-confirms payments via ITN, so there's no manual confirmation
  step that bank-API access would shorten. Direct bank integration is
  also not available for small South African use cases at reasonable cost.

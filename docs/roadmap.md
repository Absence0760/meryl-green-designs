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
- [x] Sanity Studio with three schemas: `product`, `galleryPhoto`, `order`
- [x] Product reads routed through the backend (so the dataset can stay private)
- [x] Gallery reads routed through the backend (same pattern)
- [x] Order creation writes to Sanity with full PII protection

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
- [x] Vitest test suite across backend and frontend (79 tests total: 71
      backend + 8 frontend, <1s runtime). Backend covers email templates
      + HTML escaping, `sendEmail` with mocked Resend fetch, Sanity
      webhook HMAC verification, `POST /orders` + `GET /orders/:ref`,
      `/products` + `/gallery`, CORS (including `ALLOWED_ORIGINS` fallback
      behaviour), `/health`, 404 handling, and a regression guard that
      fails if banking details ever reappear in the automated
      pending-payment email. Frontend covers `formatPrice` (null, zero,
      positive, large numbers) and `imageUrl` (width omitted/included,
      null project-id branch in a separate test file). All tests mock
      Sanity and Resend so they run offline. Root `pnpm test` runs both
      workspaces.
- [x] CI workflow (`.github/workflows/ci.yml`) runs `pnpm check` + `pnpm
      test` on every PR and every push to `main`/`dev`, with
      cancel-in-progress concurrency so rapid pushes don't stack up.

### Developer experience
- [x] All dependencies upgraded to latest major versions (Svelte 5.55,
      SvelteKit 2.57, Vite 8, TypeScript 6, Sanity 5, React 19, Hono 4.12,
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
- [ ] Meryl's reusable banking-details email reply block. The automated
      pending-payment confirmation no longer contains banking details at
      all; they're sent manually by Meryl in reply to each order
      (intentional — see `docs/security.md § Risk 1` for the impersonation
      threat model). She needs a saved email snippet with the real values
      so the reply takes 30 seconds per order, not 3 minutes.
- [ ] Real contact details on `frontend/src/routes/contact/+page.svelte`:
      - [x] real email — `zagreenwoman@gmail.com` (confirmed by Meryl 2026-04-16)
      - [ ] phone number — row removed for now because Meryl hasn't
            provided a number. Once she does, add a new `<div
            class="contact-row">` with `<dt>Phone</dt><dd>…</dd>` back
            into the markup at the location flagged by the HTML
            comment.
      - [x] studio location — "Based in the Western Cape, South Africa.
            Shipped nationwide." (confirmed by Meryl 2026-05-13). A
            specific town would be friendlier but is not blocking.
- [ ] Meryl populates the shop with real products via Sanity Studio
- [ ] Meryl populates the gallery with real photos via Sanity Studio
- [ ] **ECT Act s43 business identification** for the Returns page
      (the section that satisfies ECT Act s43's disclosure
      requirements for online retailers). Meryl needs to supply:
      registered business name, legal status (sole trader / CC / Pty
      Ltd), physical address (or PO Box if she prefers, for a
      home-studio operation), telephone number, and any registration
      number (e.g. CIPC). The page currently shows only her email so
      it reads cleanly, but ECT s43 requires the full set before
      launch. Insert into the "About Meryl Green Designs" section of
      `frontend/src/routes/returns/+page.svelte`.
- [ ] South African legal professional reviews the three policy pages
      before they go live: `frontend/src/routes/privacy/+page.svelte`
      (POPIA wording, cross-border transfer language, retention periods),
      `frontend/src/routes/returns/+page.svelte` (CPA windows, courier
      SLAs, the ECT s43 disclosure once Meryl fills it in), and
      `frontend/src/routes/terms/+page.svelte` (governing-law clause,
      lead-time numbers, CPA s51 limitation scope). Each page's header
      comment lists the specific items the reviewer must confirm.

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
- [ ] **Self-service payment retry** for orders left in `pending_payment`
      after a failed PayFast attempt. Same `orderRef` re-submitted to
      PayFast so the eventual ITN updates the original Sanity doc instead
      of orphaning it. Requires per-orderRef rate limit, 7-day retry
      window, status guard, and a failed-payment email after 24h with no
      successful ITN. **Full proposal:**
      [`docs/payment-retry-plan.md`](./payment-retry-plan.md).
- [ ] Structured product picker on the order form (checkboxes + quantities
      per product) — only worth it once there are enough products that
      the free-text field feels clumsy
- [ ] "About Meryl" page
- [ ] Archive of past / sold products
- [ ] Newsletter signup (only if Meryl wants it)
- [ ] Lambda alias for cleaner one-command rollback (right now rollback is
      via "re-run the previous workflow"; works but an alias is tidier)
- [ ] Sitemap.xml generator

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
- [ ] **Split order PII out of Sanity into AWS DynamoDB.** Triggered by
      Sanity's Free plan only permitting public datasets — to drop the
      ~R285/month Growth subscription, customer PII (name, email, phone,
      address, items, notes, tracking) moves to a private DynamoDB table
      while order reference + status + amount stays on Sanity. Meryl's
      Studio workflow is preserved via custom React panels that fetch
      PII through a new `/admin/orders` backend route. ~7–11 days of
      work for ~R283/month (~R3,400/year) saving; the real motivation is
      reducing third-party PII processors, not the money. **Full
      proposal:** [`docs/orders-pii-split-plan.md`](./orders-pii-split-plan.md).

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

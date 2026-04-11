# Roadmap

This document tracks what's built, what's left before launch, and what's
planned for later. Items move between sections as they're shipped.

## Status at a glance

**The app is code-complete for v1.** Every feature in the original client
brief (home with hero + story + poem, gallery, shop with EFT ordering,
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
- [x] `bin/setup.sh` one-command bootstrap (state bucket, `terraform apply`,
      GitHub Actions variables, Sanity dataset privacy, backend webhook)
- [x] Dependabot configured with grouped weekly updates for all three
      workspace packages + GitHub Actions
- [x] Backend Lambda bundling via esbuild
- [x] Backend env loading via `dotenv` for local dev

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
- [x] `docs/deployment.md` — 920-line deployment guide with script-first
      flow, env var reference, rollback, troubleshooting, and "adding a new
      content type" playbook
- [x] `docs/orders-and-tracking.md` — detailed order flow + security notes
- [x] `infra/README.md` — Terraform module reference
- [x] Root `README.md`

## Remaining before launch

These are the things that actually block flipping the switch to live
traffic. Most are external, and each is documented with exact steps in
[`deployment.md`](./deployment.md).

### Content (needs Meryl)
- [ ] Real banking details — currently `[ To be provided ]` in two places:
      - `backend/src/email-templates.ts` (`bankingDetailsHtml()`)
      - `frontend/src/routes/shop/+page.svelte` (the EFT card at the bottom)
- [ ] Real contact email — currently `hello@merylgreendesigns.co.za`
      placeholder in `frontend/src/routes/contact/+page.svelte`
- [ ] Meryl populates the shop with real products via Sanity Studio
- [ ] Meryl populates the gallery with real photos via Sanity Studio

### External accounts
- [ ] Resend account with verified sending domain (DNS propagation wait
      is typically 5–30 min)
- [ ] Sanity: set `production` dataset visibility to **Private** in the
      dashboard, or let `bin/setup.sh` do it by providing `SANITY_ADMIN_TOKEN`
- [ ] AWS account with `af-south-1` region enabled (opt-in regions need a
      manual click)
- [ ] Domain registered + Route 53 hosted zone existing

### Deployment
- [ ] Fill in `infra/terraform.tfvars` (one 3-minute edit)
- [ ] Run `./bin/setup.sh` (one command, ~15 min of which is CloudFront
      propagation)
- [ ] Run the first GitHub Actions workflows (`deploy-frontend`,
      `deploy-backend`)
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
- [ ] Rate limiting on `POST /orders` (Hono middleware, ~10 lines) — add
      when spam becomes a real problem
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

- [ ] Card payments (Stripe, Yoco, or PayFast) — adds webhooks, a database
      to reconcile payment state, and PCI scope. The EFT flow is
      intentionally simpler and avoids all of this.
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

## Explicit non-goals

Things we deliberately will not build unless the business case changes
materially.

- **Customer accounts / login.** The site is small, EFT is manual, and
  tracking is key-based (ref + email). Accounts would be friction for no
  gain.
- **Real-time chat / live support.**
- **A mobile app.** Everything important works in a mobile browser.
- **Marketplace features.** Only one seller, not a platform.
- **Bank API integration for automatic payment confirmation.** Not
  available for small South African EFT use cases at reasonable cost.

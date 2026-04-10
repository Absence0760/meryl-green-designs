# Roadmap

This document tracks planned work. Items are grouped by when they need to happen,
not by size. No time estimates — they're misleading for a project like this.

## Before launch

These must be done before the site can go live.

### Content
- [ ] Hero photograph for the home page
- [ ] Real story text (home page)
- [ ] Real poem text (home page)
- [ ] Gallery photographs with captions
- [ ] Product photographs, names, prices, descriptions for the shop
      *(managed in Sanity Studio — Meryl can enter these herself once the
      project is set up)*
- [ ] Real banking details: account name, bank, account number, branch code
- [ ] Contact email address (currently `hello@merylgreendesigns.co.za`
      placeholder)
- [ ] Favicon and social share image

### Infrastructure
- [ ] Register a Resend account and verify the sending domain
- [ ] Create a Sanity project at https://www.sanity.io/manage and note the project
      ID
- [ ] In the Sanity dashboard, set the `production` dataset visibility to
      **Private** (Project → API → Datasets → `production` → Edit). Once
      this is done, anonymous GROQ queries against the dataset will be
      rejected — all reads go through the backend's authenticated client.
- [x] ~~PII on public dataset~~ — fixed in code by routing product reads
      through the backend. See "Private dataset + backend-mediated reads"
      in [`orders-and-tracking.md`](./orders-and-tracking.md). All that
      remains is flipping the dataset's visibility switch in the Sanity
      dashboard, which is the item above.
- [ ] Create a Sanity API token (Editor role, or custom role scoped to
      `order`) and set `SANITY_API_TOKEN` on the backend
- [ ] Generate a webhook secret (`openssl rand -hex 32`) and set
      `SANITY_WEBHOOK_SECRET` on the backend + in Sanity's webhook config
- [ ] Create the Sanity webhook for order status emails (URL:
      `${lambda_function_url}/webhooks/sanity-order`, filter:
      `_type == "order" && delta::changedAny(status)`, trigger: Update) —
      see `orders-and-tracking.md` "What still needs to happen"
- [ ] Enable the `af-south-1` region in your AWS account
- [ ] Bootstrap the Terraform state backend (one-time manual step — see
      `infra/README.md`)
- [ ] Fill in `infra/terraform.tfvars` (including the new Sanity token and
      webhook secret) and run `terraform apply`
- [ ] Create the `production` GitHub environment and populate the variables
      listed in `docs/deployment.md` step 5
- [ ] Run the `Deploy frontend` workflow manually for the first deploy
- [ ] Run the `Deploy backend` workflow manually for the first deploy
- [ ] Run `pnpm studio deploy` locally for the first studio publish, then let
      the workflow handle subsequent deploys
- [ ] Wire the Sanity content-rebuild webhook to `repository_dispatch` on
      the frontend workflow (separate from the order-status webhook — see
      `docs/deployment.md` step 9)
- [x] ~~Orders as Sanity documents + track page + webhook-driven status
      emails~~ — built, see
      [`orders-and-tracking.md`](./orders-and-tracking.md)
- [x] ~~Write a CDK stack~~ — done with Terraform instead, see `infra/`
- [x] ~~Set up a deploy pipeline~~ — done, see `.github/workflows/`

### Quality / polish
- [ ] End-to-end test the order flow against the real Resend account
- [ ] Remove the under-construction banner
- [ ] Run Lighthouse and address any critical findings
- [ ] Add basic SEO meta tags and Open Graph images per route

## Near-term (after launch)

Nice-to-haves that can wait until the site is live and Meryl has feedback.

- [x] ~~Orders as Sanity documents + public track page + webhook-driven status
      emails~~ — **built**. See
      [`orders-and-tracking.md`](./orders-and-tracking.md) for the full flow
      and the remaining one-time setup steps.
- [ ] Extend the CMS to cover home page story, poem, and hero photo so Meryl
      can edit these herself
- [ ] Extend the CMS to cover the gallery so Meryl can upload photos directly
- [ ] Replace the free-form "items" textarea with a structured product picker
      (checkboxes + quantity per product) once there are enough products for
      this to be worth the extra UX
- [ ] Image optimisation and lazy-loading on the gallery
- [ ] Rate limiting on the `/orders` endpoint (to deter spam past what the
      honeypot catches)
- [ ] Basic spam score / filter for order submissions
- [ ] Archive of past products / sold items
- [ ] "About Meryl" page
- [ ] Newsletter signup (if she wants it)

## Longer-term / speculative

Only build these if there's a real reason to.

- [ ] Card payments (Stripe, Yoco, or PayFast). Adds webhooks, a database to
      reconcile payment state, and PCI scope — large step up in complexity.
- [ ] Inventory tracking with real stock counts. Requires a database. The
      current "available" toggle is binary — no count of units remaining.
- [x] ~~Order admin dashboard for Meryl to mark orders as paid/shipped~~ —
      promoted to a near-term item with a concrete plan in
      [`orders-and-tracking.md`](./orders-and-tracking.md).
- [ ] Multi-language (English + Afrikaans, maybe)
- [ ] Integration with a shipping provider for live tracking

## Explicit non-goals

Things we are deliberately not planning to do.

- Customer accounts / login — the site is small, EFT is manual, accounts add
  complexity for no gain.
- Real-time chat / live support.
- A mobile app — everything important works in a mobile browser.
- Marketplace features (multiple sellers).

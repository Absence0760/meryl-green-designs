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
- [ ] Real banking details: account name, bank, account number, branch code
- [ ] Contact email address (currently `hello@merylgreendesigns.co.za`
      placeholder)
- [ ] Favicon and social share image

### Infrastructure
- [ ] Register a Resend account and verify the sending domain
- [ ] Set up an AWS account if one does not exist
- [ ] Provision S3 bucket + CloudFront distribution for the frontend
- [ ] Provision Lambda Function URL for the backend
- [ ] Configure the custom domain (ACM cert, Route 53, CloudFront alias)
- [ ] Set `PUBLIC_API_URL` to the production Lambda URL at build time
- [ ] Set backend env vars in Lambda (`RESEND_API_KEY`, `FROM_EMAIL`,
      `OWNER_EMAIL`, `ALLOWED_ORIGINS`)
- [ ] Write a CDK stack (or SAM template) so the infrastructure is reproducible
- [ ] Set up a deploy pipeline (GitHub Actions) that builds the frontend with the
      right env vars, uploads to S3, invalidates CloudFront, and deploys the
      Lambda

### Quality / polish
- [ ] End-to-end test the order flow against the real Resend account
- [ ] Remove the under-construction banner
- [ ] Run Lighthouse and address any critical findings
- [ ] Add basic SEO meta tags and Open Graph images per route

## Near-term (after launch)

Nice-to-haves that can wait until the site is live and Meryl has feedback.

- [ ] Replace the single textarea "items" field with structured product IDs and
      quantities once real products exist
- [ ] Per-product "Order this" buttons that pre-fill the order form
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
- [ ] Inventory tracking with real stock counts. Requires a database.
- [ ] A simple CMS so Meryl can edit story/poem/gallery/products without a dev
      touching the repo. Candidates: Sanity, TinaCMS, Decap. Adds a build-time
      content fetch.
- [ ] Order admin dashboard for Meryl to mark orders as paid/shipped instead of
      reading her email
- [ ] Multi-language (English + Afrikaans, maybe)
- [ ] Integration with a shipping provider for live tracking

## Explicit non-goals

Things we are deliberately not planning to do.

- Customer accounts / login — the site is small, EFT is manual, accounts add
  complexity for no gain.
- Real-time chat / live support.
- A mobile app — everything important works in a mobile browser.
- Marketplace features (multiple sellers).

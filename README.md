# Meryl Green Designs

Website for Meryl Green Designs — a small South African studio selling
handcrafted screens and designs inspired by the African bush. A static
brochure site with a gallery, a shop checkout via PayFast (cards, Apple
Pay, SnapScan), and a content management dashboard the shop owner uses
to manage products herself.

## Stack

- **Frontend**: SvelteKit (Svelte 5) built with `adapter-static`, hosted on S3
  + CloudFront
- **Backend**: Hono on AWS Lambda fronted by API Gateway (HTTP API), sends
  order emails via Resend
- **CMS**: Sanity Studio v6 (React 19), hosted at `*.sanity.studio`
- **Infrastructure**: Terraform (`infra/`) — S3, CloudFront, Lambda, API
  Gateway, IAM, Route 53, ACM, GitHub OIDC
- **CI/CD**: GitHub Actions (`.github/workflows/`) deploying via OIDC
  federation (no long-lived AWS keys)

## Repo layout

```
meryl-green-designs/
├── frontend/       SvelteKit site
├── backend/        Hono API (local Node server + AWS Lambda entry)
├── studio/         Sanity Studio (content management UI)
├── infra/          Terraform — all AWS resources
├── bin/            Setup + ops scripts (setup.sh, dev helpers)
├── .github/
│   └── workflows/  Deploy pipelines + Claude Code automation
└── docs/           Architecture, features, roadmap, run-locally, deployment
```

## Quick start

No secrets, cloud accounts or env-file copying needed — each workspace's
committed `.env.development` holds safe local defaults (local sample content,
emails captured to disk, PayFast's public sandbox, LocalStack for DynamoDB):

```bash
pnpm install
pnpm dev:db:up              # optional: LocalStack (Docker) so checkout / order tracking work
pnpm dev                    # frontend (:7777) + backend (:3001)
```

Sanity Studio is optional for local dev; it needs a (free, personal) Sanity
project — see [`docs/run-locally.md § Sanity Studio (optional)`](./docs/run-locally.md#sanity-studio-optional).
Maintainers working against production Sanity or deploying decrypt the real
secrets from the sibling private `infra-secrets` repo — see
[`docs/run-locally.md § Maintainers`](./docs/run-locally.md#maintainers-production-parity-and-deploying)
and [`docs/deployment.md § Secrets management`](./docs/deployment.md#secrets-management).

## One-command production deploy

Once prerequisites are in place (AWS / GitHub / Sanity / Resend accounts,
`af-south-1` enabled, `infra/terraform.tfvars` filled in), the entire
infrastructure setup is one command:

```bash
./bin/setup.sh
```

It creates the Terraform state backend, runs `terraform apply`, populates
GitHub Actions environment variables, and (with `SANITY_AUTH_TOKEN` set)
configures the Sanity webhook and dataset privacy. See
[`docs/deployment.md`](./docs/deployment.md) for the complete walkthrough
and what still needs manual attention.

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — how the pieces fit together
- [`docs/features.md`](./docs/features.md) — what the site currently does
- [`docs/run-locally.md`](./docs/run-locally.md) — getting it running on your machine
- [`docs/deployment.md`](./docs/deployment.md) — first-time AWS deploy walkthrough
- [`docs/roadmap.md`](./docs/roadmap.md) — what's planned, what's not
- [`docs/orders-and-tracking.md`](./docs/orders-and-tracking.md) — order schema, status webhook, public track page
- [`docs/orders-pii-split.md`](./docs/orders-pii-split.md) — Phase 1 PII split (DynamoDB + Sanity), live since 2026-05-13
- [`docs/payment-retry.md`](./docs/payment-retry.md) — payment-retry flow for failed/cancelled orders
- [`docs/security.md`](./docs/security.md) — risk register, mitigations, incident playbook
- [`playwright/README.md`](./playwright/README.md) — end-to-end test suite
- [`infra/README.md`](./infra/README.md) — Terraform module specifics

## Commands

```bash
pnpm dev                    # frontend + backend in parallel
pnpm dev:all                # + studio
pnpm build                  # build all packages
pnpm check                  # typecheck all packages
pnpm test                   # vitest run across workspaces

# End-to-end (Playwright) — needs LocalStack + a test-e2e Sanity dataset
pnpm --filter @meryl-green-designs/playwright test            # headless run
pnpm --filter @meryl-green-designs/playwright test:headed     # see the browser

# Local dev infrastructure (LocalStack emulating DynamoDB on :4566)
pnpm dev:db:up              # start LocalStack + create the orders table (idempotent)
pnpm dev:db:down            # stop the container, keep data
pnpm dev:db:reset           # wipe volume + bring back up fresh
pnpm dev:db:scan            # scan the local orders table (quick view)
pnpm dev:emails             # open the most recent captured email (EMAIL_BACKEND=file)

# One-off ops (PII split + retry/backfill)
pnpm backfill:orders[:dry]      # copy Sanity order PII back into DynamoDB
pnpm restore:sanity-pii[:dry]   # restore PII onto Sanity orders (Phase-1 rollback)
pnpm scrub:sanity-pii[:dry]     # delete PII from historical Sanity order docs

pnpm frontend <script>      # shortcut: pnpm --filter @meryl-green-designs/frontend
pnpm backend <script>       # shortcut: pnpm --filter @meryl-green-designs/backend
pnpm studio <script>        # shortcut: pnpm --filter @meryl-green-designs/studio
```

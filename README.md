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
- **CMS**: Sanity Studio v3, hosted at `*.sanity.studio`
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
├── .github/
│   └── workflows/  Deploy pipelines + Claude Code automation
└── docs/           Architecture, features, roadmap, run-locally, deployment
```

## Quick start

```bash
pnpm install

# First-time only: provision a dedicated KMS key for this project's secrets
# and seed the SOPS-encrypted files from examples. Requires AWS CLI auth.
# See docs/deployment.md § Secrets management for the full workflow.
./bin/sops-init.sh

# Decrypt the backend secrets into a local .env for pnpm dev:
sops -d backend/.env.sops > backend/.env

# Frontend and studio have public, non-secret env vars — plain copy is fine:
cp frontend/.env.example frontend/.env
cp studio/.env.example studio/.env

pnpm dev                    # frontend (:7777) + backend (:3001)
pnpm studio dev             # Sanity Studio (:3333) — run separately when needed
```

See [`docs/run-locally.md`](./docs/run-locally.md) for the full setup walkthrough
and [`docs/deployment.md`](./docs/deployment.md) for the SOPS workflow.

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
- [`docs/orders-and-tracking.md`](./docs/orders-and-tracking.md) — orders as Sanity docs + public track page
- [`docs/security.md`](./docs/security.md) — risk register, mitigations, incident playbook
- [`infra/README.md`](./infra/README.md) — Terraform module specifics

## Commands

```bash
pnpm dev                    # frontend + backend in parallel
pnpm dev:all                # + studio
pnpm build                  # build all packages
pnpm check                  # typecheck all packages

pnpm frontend <script>      # shortcut: pnpm --filter @meryl-green-designs/frontend
pnpm backend <script>       # shortcut: pnpm --filter @meryl-green-designs/backend
pnpm studio <script>        # shortcut: pnpm --filter @meryl-green-designs/studio
```

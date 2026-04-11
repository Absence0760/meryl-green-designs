# CLAUDE.md

Guidance for Claude Code working in this repository. Keep this file short — it loads into every conversation.

## Project

Meryl Green Designs — website for a small South African studio selling handcrafted screens and designs. Static brochure + gallery, a shop that takes orders via Electronic Funds Transfer (no card processor), and a Sanity CMS the owner uses to manage products.

## Stack

- **frontend/** — SvelteKit 5 static site (adapter-static), Vite, TypeScript, vitest. Dev port `7777`.
- **backend/** — Hono on AWS Lambda (Function URL). TypeScript, esbuild, tsx for local dev, vitest. Sends order emails via Resend (raw `fetch`, no SDK). Dev port `3001` (`PORT` env override).
- **studio/** — Sanity Studio (`sanity ^5.x`, React 19). No tests. Dev port `3333`.
- **infra/** — Terraform: S3 + CloudFront + Lambda + Route 53 + ACM + GitHub OIDC. No package.json.

pnpm monorepo, three workspaces: `@meryl-green-designs/{frontend,backend,studio}`. Node `>=20`.

## Commands (run from repo root)

```bash
pnpm install                 # bootstrap
pnpm dev                     # frontend (7777) + backend (3001) in parallel
pnpm dev:all                 # + studio (3333)
pnpm build                   # build all workspaces
pnpm check                   # typecheck all
pnpm test                    # vitest run across workspaces
pnpm frontend <script>       # run a script in one workspace
pnpm backend <script>
pnpm studio <script>
```

Tests live in `frontend/` and `backend/` (vitest). Studio has none — don't add placeholder tests.

## First-time setup

1. `pnpm install`
2. Copy env templates: `cp backend/.env.example backend/.env` (and the same for `frontend/` and `studio/`), then fill in secrets.
3. `pnpm dev` — or `pnpm dev:all` if you need the CMS.

`bin/setup.sh` is a one-shot **production bootstrap** (Terraform state backend, apply, GitHub Actions secrets, Sanity webhook). Do not run it for local dev.

## Where to look

- `docs/architecture.md` — system diagram and service boundaries
- `docs/run-locally.md` — detailed local dev setup
- `docs/deployment.md` — CI/CD, OIDC, release flow
- `docs/features.md`, `docs/roadmap.md` — current and planned features
- `docs/orders-and-tracking.md` — implemented design for orders as Sanity docs + public track page
- `docs/security.md` — risk register, mitigations, incident playbook, hardening gaps
- `infra/README.md` — Terraform module specifics
- `.github/workflows/` — deploy pipelines (OIDC, no long-lived AWS keys) + `claude.yml` Claude Code automation

Prefer reading these over guessing. Update them when behavior changes.

## Every change must update docs and tests

When you modify code, in the same change:

1. **Update tests** — add or adjust vitest coverage in `frontend/` or `backend/` for the behavior you touched. If a change is genuinely untestable (config, infra, pure styling), say so explicitly in your summary rather than skipping silently.
2. **Update docs** — if the change affects architecture, commands, env vars, deployment, features, or the order flow, update the relevant file in `/docs` (and this `CLAUDE.md` if setup or workflows changed). A one-line doc edit is still an edit.

Treat "code changed, docs and tests unchanged" as an incomplete task. Call it out before handing back.

## Conventions and gotchas

- **Static frontend** — no SSR. Anything dynamic goes through the backend API, not SvelteKit load functions on the server.
- **Two backend entry points** — `backend/src/app.ts` builds the Hono app via `createApp()`. `backend/src/server.ts` is the local dev entry (imports `dotenv/config`, runs `@hono/node-server`). `backend/src/lambda.ts` is the AWS Lambda entry and deliberately does **not** import `server.ts`, so esbuild tree-shakes `dotenv` out of the deployment bundle. Do not add `dotenv` imports to any module reachable from `lambda.ts`, or it will end up in the Lambda bundle.
- **Secrets** — never commit `.env` files or Terraform state. GitHub Actions uses OIDC; do not introduce AWS access keys.
- **Terraform** — don't run `terraform apply` without explicit user confirmation. `plan` is fine.
- **Infra changes** — coordinate Terraform edits with the workflow changes in `.github/workflows/` that depend on them.
- **Studio schema changes** — regenerate types on the frontend side if the frontend consumes them.

## What not to do

- Don't add a test framework other than vitest.
- Don't replace pnpm with npm/yarn — workspace filters assume pnpm.
- Don't add SSR adapters to the frontend; it must stay static for the S3 + CloudFront deploy.
- Don't call Resend (or other secret-bearing services) directly from the frontend — go through the backend.
- Don't introduce Stripe or other card processors without discussing first. Current shop is EFT-only by design.

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
2. `./bin/sops-init.sh` — verifies AWS auth, creates a dedicated KMS key + alias (`alias/meryl-green-designs-sops` in `af-south-1`) if missing, writes the ARN into `.sops.yaml`, seeds encrypted `infra/terraform.tfvars.sops` and `backend/.env.sops` from the examples. Idempotent — re-running reuses the existing key.
3. `sops backend/.env.sops` to fill in real secrets (opens plaintext in `$EDITOR`, re-encrypts on save via KMS). Then `sops -d backend/.env.sops > backend/.env` for local dev.
4. `cp frontend/.env.example frontend/.env` and same for `studio/` — these only contain `PUBLIC_*` vars, no secrets.
5. `pnpm dev` — or `pnpm dev:all` if you need the CMS.

`bin/setup.sh` is a one-shot **production bootstrap** (Terraform state backend, apply, GitHub Actions secrets, Sanity webhook). It decrypts `infra/terraform.tfvars.sops` into a scratch plaintext file at start and shreds it on exit. Do not run it for local dev.

**Secrets policy** — all secrets (Resend API key, Sanity tokens) live in the repo as SOPS-encrypted `*.sops` files. Decryption requires `kms:Decrypt` permission on the project's KMS key via AWS IAM — there is no key file to back up. Plaintext siblings (`terraform.tfvars`, `backend/.env`) are gitignored and exist only transiently. Never run `git add -f` on a plaintext secrets file. Never add a SOPS backend other than the project's KMS key without discussing — that changes who can decrypt. See `docs/deployment.md § Secrets management` for the full workflow.

## Where to look

- `docs/architecture.md` — system diagram and service boundaries
- `docs/run-locally.md` — detailed local dev setup
- `docs/deployment.md` — CI/CD, OIDC, release flow, SOPS secrets workflow
- `docs/features.md`, `docs/roadmap.md` — current and planned features
- `docs/orders-and-tracking.md` — implemented design for orders as Sanity docs + public track page
- `docs/security.md` — risk register, mitigations, incident playbook, hardening gaps
- `infra/README.md` — Terraform module specifics
- `.github/workflows/` — `ci.yml` (PR + push typecheck/test), three release-gated deploy workflows with a skip-if-unchanged check job, `claude.yml` Claude Code automation. OIDC for AWS, no long-lived keys.

Prefer reading these over guessing. Update them when behavior changes.

## Every change must update docs and tests

When you modify code, in the same change:

1. **Update tests** — add or adjust vitest coverage in `frontend/` or `backend/` for the behavior you touched. If a change is genuinely untestable (config, infra, pure styling), say so explicitly in your summary rather than skipping silently.
2. **Update docs** — if the change affects architecture, commands, env vars, deployment, features, or the order flow, update the relevant file in `/docs` (and this `CLAUDE.md` if setup or workflows changed). A one-line doc edit is still an edit.

Treat "code changed, docs and tests unchanged" as an incomplete task. Call it out before handing back.

## Project-specific overrides to default behaviour

- **Do not run the dev server to visually verify UI or frontend changes** before reporting a task complete. `pnpm check` (typecheck) and `pnpm test` (vitest) are sufficient. The operator reviews visuals themselves — don't block on browser verification unless they explicitly ask for it.

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

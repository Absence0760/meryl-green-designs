# CLAUDE.md

Repo-wide guidance. Loads into every Claude Code session — keep short. Per-workspace specifics live in each workspace's own `CLAUDE.md` (loaded only when working in that subtree).

## Project

Meryl Green Designs — website for a small South African studio selling handcrafted screens. Static brochure + gallery + shop, payments via PayFast (cards, Apple Pay, SnapScan — redirect model, no card data on our servers), Sanity CMS for content.

## Workspaces (pnpm monorepo, Node ≥22)

| Path | What | Dev port | Per-workspace guide |
|---|---|---|---|
| `frontend/` | SvelteKit 5 static site | 7777 | `frontend/CLAUDE.md` |
| `backend/` | Hono on Lambda + local Node | 3001 | `backend/CLAUDE.md` |
| `studio/` | Sanity Studio (React 19) | 3333 | `studio/CLAUDE.md` |
| `infra/` | Terraform (AWS + GitHub OIDC) | — | `infra/CLAUDE.md` |

## Commands (run from repo root)

```bash
pnpm install                 # bootstrap
pnpm dev                     # frontend + backend in parallel
pnpm dev:all                 # + studio

# Local dev infrastructure (no AWS, no Resend)
pnpm dev:db:up               # start DynamoDB Local + create the orders table (idempotent)
pnpm dev:db:down             # stop the container, keep data
pnpm dev:db:reset            # wipe volume + bring back up fresh
pnpm dev:db:scan             # scan the local orders table (quick view)
pnpm dev:emails              # open the most recent captured email (EMAIL_BACKEND=file)

pnpm build                   # build all workspaces
pnpm check                   # typecheck all
pnpm test                    # vitest run across workspaces (frontend + backend)
pnpm frontend|backend|studio <script>   # filter to one workspace
```

## First-time setup

1. `pnpm install`
2. `./bin/sops-init.sh` — provisions the project's KMS key (`alias/meryl-green-designs-sops` in `af-south-1`), wires it into `.sops.yaml`, seeds encrypted `infra/terraform.tfvars.sops` + `backend/.env.sops` from the examples. Idempotent.
3. `sops backend/.env.sops` to fill in real secrets, then `sops -d backend/.env.sops > backend/.env` for local dev.
4. `cp frontend/.env.example frontend/.env` and same for `studio/` (no secrets — `PUBLIC_*` only).
5. `pnpm dev:db:up` — starts a local DynamoDB container and creates the orders table. Required for the order dual-write and the Studio's PII panels; without it the order create still succeeds but logs a shadow-write error and the Studio panels are inert.
6. `pnpm dev` (or `pnpm dev:all`).

`bin/setup.sh` is the **production bootstrap** (Terraform state backend, apply, GitHub Actions vars, Sanity webhook). Decrypts tfvars to a scratch file at start and shreds it on exit. Don't run it for local dev.

## Cross-cutting policies

**Secrets.** All secrets live in the repo as SOPS-encrypted `*.sops` files; decryption needs `kms:Decrypt` on the project KMS key. Plaintext siblings are gitignored and exist transiently. Never `git add -f` a plaintext secrets file. Never add a SOPS recipient other than the project KMS key without discussing — that changes who can decrypt. Full workflow: `docs/deployment.md § Secrets management`.

**Every code change updates tests + docs in the same change.**

1. Update vitest coverage in the workspace you touched. If genuinely untestable (config, infra, pure styling), say so explicitly — don't skip silently.
2. Update the relevant file in `/docs` if the change affects architecture, commands, env vars, deployment, features, or the order flow. A one-line doc edit is still an edit.

Treat "code changed, docs and tests unchanged" as an incomplete task — flag it before handing back.

**Don't run the dev server to visually verify UI/frontend changes** before reporting a task complete. `pnpm check` + `pnpm test` are sufficient; the operator reviews visuals themselves. Only spin up the dev server if explicitly asked.

## Repo-wide hard rules (the per-workspace files have more)

- Don't replace pnpm with npm/yarn — workspace filters assume pnpm.
- Don't add a test framework other than vitest.
- Don't introduce AWS access keys — CI uses GitHub OIDC.
- Don't replace PayFast with another card processor without discussing.

## Where to look (cross-cutting docs)

- `docs/architecture.md` — system diagram, service boundaries, content + order flow
- `docs/run-locally.md` — local dev walkthrough
- `docs/deployment.md` — CI/CD, OIDC, release flow, SOPS workflow, env var reference
- `docs/features.md`, `docs/roadmap.md` — current and planned features
- `docs/orders-and-tracking.md` — order schema + status webhook design
- `docs/orders-pii-split-plan.md` — proposal (not implemented) for moving order PII off Sanity into DynamoDB so the Sanity Free plan suffices
- `docs/security.md` — risk register, mitigations, incident playbook
- `infra/README.md` — Terraform module specifics
- `.github/workflows/` — `ci.yml` (PR + push typecheck/test), `codeql.yml` (SAST on PR + push + weekly), `audit.yml` (weekly `pnpm audit`, auto-files an issue), three release-gated deploy workflows with skip-if-unchanged checks, `dependabot-lockfile.yml` (syncs root pnpm-lock.yaml on Dependabot PRs), `claude.yml` automation

Prefer reading these over guessing. Update them when behaviour changes.

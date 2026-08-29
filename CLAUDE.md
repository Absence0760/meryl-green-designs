# CLAUDE.md

Repo-wide guidance. Loads into every Claude Code session — keep short. Per-workspace specifics live in each workspace's own `CLAUDE.md` (loaded only when working in that subtree).

## Project

Meryl Green Designs — website for a small South African studio selling handcrafted screens. Static brochure + gallery + shop, payments via PayFast (cards, Apple Pay, SnapScan — redirect model, no card data on our servers), Sanity CMS for content.

## Workspaces (pnpm monorepo, Node ≥22)

| Path | What | Dev port | Per-workspace guide |
|---|---|---|---|
| `frontend/` | SvelteKit 2 (Svelte 5) static site | 7777 | `frontend/CLAUDE.md` |
| `backend/` | Hono on Lambda + local Node | 3001 | `backend/CLAUDE.md` |
| `studio/` | Sanity Studio (React 19) | 3333 | `studio/CLAUDE.md` |
| `infra/` | Terraform (AWS + GitHub OIDC) | — | `infra/CLAUDE.md` |
| `playwright/` | Playwright e2e suite | — | `playwright/CLAUDE.md` |

## Commands (run from repo root)

```bash
pnpm install                 # bootstrap
pnpm dev                     # frontend + backend in parallel
pnpm dev:all                 # + studio

# Local dev infrastructure (no AWS, no Resend)
pnpm dev:db:up               # start LocalStack (DynamoDB emulator on :4566) + create the orders table (idempotent)
pnpm dev:db:down             # stop the container, keep data
pnpm dev:db:reset            # wipe volume + bring back up fresh
pnpm dev:db:scan             # scan the local orders table (quick view)
pnpm dev:emails              # open the most recent captured email (EMAIL_BACKEND=file)

pnpm build                   # build all workspaces
pnpm check                   # typecheck all
pnpm test                    # `pnpm -r run test` — vitest in frontend + backend AND Playwright (needs LocalStack up). For unit-only locally, run `pnpm --filter '!@meryl-green-designs/playwright' --filter '!meryl-green-designs' -r run test`. CI splits the two — see ci.yml + e2e.yml.
pnpm frontend|backend|studio <script>   # filter to one workspace

# End-to-end (Playwright) — needs LocalStack + a test-e2e Sanity dataset.
# See playwright/README.md for first-time setup. NEVER hits prod — the
# env-guard in playwright/global-setup.ts aborts the run if anything
# would point at production.
pnpm --filter @meryl-green-designs/playwright test            # headless
pnpm --filter @meryl-green-designs/playwright test:headed     # see the browser
pnpm --filter @meryl-green-designs/playwright test:ui         # Playwright UI
```

## Root package.json scripts — estate format

Root `scripts` follow the estate-wide format canonized in the templates repo's `base` CLAUDE.md; the exemplar is `project-running/package.json` — read it before restructuring this repo's scripts:

- `"//-- <group> --": "<one-line description>"` comment-key dividers above each cluster; the description carries load-bearing facts (ports, prerequisites, doc pointers), not filler.
- Verb-first, colon-namespaced names: `setup[:*]`, `dev:*` (orchestrators, then `dev:db:*`, `dev:run:<app>`, per-service groups), `build:<surface>`, `check:<surface>`, `test:<surface>[:unit|:e2e]`, `gen:<what>`. Long-running services reuse the lifecycle verbs `up`/`down`/`status`/`logs`.
- JSON holds one-liners only — anything longer delegates to a script under `bin/` or `scripts/`; workspace delegation goes through `pnpm -C <workspace> <script>`.
- New scripts join an existing group (or add a new `//--` divider in the right place); never append ungrouped entries at the bottom.
- Keep a `test:scripts` guard validating the root script targets (project-running's `scripts/check_root_scripts.mjs` is the reference shape; write it against this repo's layout).

If the current scripts block predates this format, migrate it the next time a change touches it — as its own commit, and renaming a script must update every caller (CI workflows, docs, `bin/`) in the same change.

## First-time setup

1. `pnpm install`
2. Clone the sibling private secrets repo next to this one: `git clone git@github.com:Absence0760/infra-secrets.git ../infra-secrets`. The project's encrypted secrets live in `infra-secrets/meryl-green-designs/` (the KMS key `alias/meryl-green-designs-sops` in `af-south-1` already exists). Need `kms:Decrypt` on that key (`aws sso login --profile mgd-jaredhoward`).
3. `sops -d ../infra-secrets/meryl-green-designs/.env.sops > backend/.env` for local dev (edit the source with `sops ../infra-secrets/meryl-green-designs/.env.sops`).
4. `cp frontend/.env.example frontend/.env` and same for `studio/` (no secrets — `PUBLIC_*` only).
5. `pnpm dev:db:up` — starts the LocalStack container (DynamoDB emulator on `:4566`) and creates the orders table. Required for the order dual-write and the Studio's PII panels; without it the order create still succeeds but logs a shadow-write error and the Studio panels are inert.
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

## Merging & branch protection

`main` follows the estate "sealed main + CI gate" standard: every change reaches `origin/main` through a PR — **no direct pushes** (enforced on admins, including the owner). Merging requires a green **`CI gate`** status check — the single required check, an aggregator job present in each functional CI workflow that `needs:` that workflow's jobs. There are **0 required approvals** — a green CI is the merge gate, not a human sign-off. Force-pushes, branch deletion, and unresolved conversations are blocked; history is linear. Commit locally per-piece, but land via a CI-gated PR.

## Where to look (cross-cutting docs)

- `docs/architecture.md` — system diagram, service boundaries, content + order flow
- `docs/run-locally.md` — local dev walkthrough
- `docs/deployment.md` — CI/CD, OIDC, release flow, SOPS workflow, env var reference
- `docs/features.md`, `docs/roadmap.md` — current and planned features
- `docs/orders-and-tracking.md` — order schema + status webhook design
- `docs/orders-pii-split.md` — design + implementation notes for the Phase-1 cutover (live since 2026-05-13): order PII lives in DynamoDB, the Sanity doc carries only the non-PII skeleton (orderRef, status, paymentMethod, amountZar, paymentId)
- `docs/security.md` — risk register, mitigations, incident playbook
- `infra/README.md` — Terraform module specifics
- `.github/workflows/` — `ci.yml` (PR + push typecheck/test), `e2e.yml` (PR + push to main, Playwright against LocalStack + test-e2e Sanity dataset), `codeql.yml` (SAST on JS/TS + GitHub Actions YAML, PR + push + weekly), `audit.yml` (weekly `pnpm audit`, auto-files an issue), `gitleaks.yml` (secret-scan on PR + push + weekly full-history sweep), `scorecard.yml` (weekly OpenSSF supply-chain posture), `terraform.yml` (`fmt -check` + `validate` + Trivy IaC on `infra/**` changes), three release-gated deploy workflows with skip-if-unchanged checks, `dependabot-lockfile.yml` (syncs root pnpm-lock.yaml on Dependabot PRs), `dependabot-auto-merge.yml` (auto-merges minor/patch Dependabot PRs once CI is green), `labeler.yml` (path-based PR labels), `pr-title-lint.yml` (conventional-commit PR titles), `claude.yml` automation

Prefer reading these over guessing. Update them when behaviour changes.

# Audit commands

Project-curated slash commands for running security, dependency, infra, and cost-control audits across the repo. Each is read-only by default — they report findings, they don't apply fixes without explicit confirmation.

Invoke from a Claude Code session as `/audit/<name>`.

## Index

### Security

| Command | What it checks |
|---|---|
| [/audit/secrets](secrets.md) | SOPS encryption status, plaintext-in-git history, server-only env in client paths, GitHub Actions secret hygiene |
| [/audit/xss](xss.md) | Svelte `{@html}`, portable-text rendering, dynamic href/src, server-rendered email HTML |

### Health

| Command | What it checks |
|---|---|
| [/audit/deps](deps.md) | `pnpm audit` per workspace, Dependabot coverage, GitHub Actions pin status, pnpm override hygiene |
| [/audit/infra](infra.md) | Terraform stacks under `infra/` — IAM least-privilege, OIDC subject conditions, S3 PAB, CloudFront security headers, KMS, drift hygiene, cost guardrails |
| [/audit/cost-controls](cost-controls.md) | Per-IP rate limits, API Gateway throttling, AWS budget alarms, Resend / Sanity quota headroom, denial-of-wallet paths |

### Dispatcher

| Command | What it does |
|---|---|
| [/audit/all](all.md) | Spawns the full sweep in parallel + consolidated report. Optional arg: `security` / `deps` / `infra` / `cost`. |

## Conventions

- Every audit is **read-only by default**. The deliverable is a findings report, not a diff.
- Findings are grouped by severity: **Critical / High / Medium / Low**.
- Each command is a **self-contained prompt** — runnable from a fresh session with no prior context.
- Cross-references: findings tie back to `docs/security.md § Risk <n>` whenever they map to the documented risk register, and to the per-workspace `CLAUDE.md` rules they violate.

## Agent delegation

The **secrets** and **xss** commands delegate to the `repo-security-auditor` agent (under `.claude/agents/`). That agent has the six trust boundaries baked in (frontend ↔ user, backend ↔ caller, backend ↔ Sanity, backend ↔ PayFast, backend ↔ Resend, CI/CD ↔ AWS) plus the audit-area routing table — it picks up the project's conventions without re-reading them every run.

The **deps**, **infra**, and **cost-controls** commands use a `general-purpose` agent with the command body as the prompt — they cross-cut code + IaC + docs and don't fit a specialised auditor.

`/audit/all` spawns one agent per area in parallel.

## Diff-time enforcement (complementary)

For per-PR enforcement (as opposed to periodic broad sweeps), use:

- [/check](../check.md) — pre-commit gate: `code-reviewer` + `test-gap-checker` + `doc-hygiene-checker` in parallel against the working diff.
- [/safe-edit](../safe-edit.md) — coder ↔ reviewer loop for non-trivial changes (~2-3x cost; use for security-sensitive or order-flow changes).
- [/release-readiness](../release-readiness.md) — pre-tag gate before publishing a release (working tree, CI, per-workspace deltas, open audit signals).

These are for per-PR / pre-deploy enforcement; the audit commands here are for periodic broad sweeps.

## When to run

- **Before a release** — `/audit/all` once, fix Critical / High before tagging. Then `/release-readiness`.
- **After bumping a dependency major** — `/audit/deps` + `/audit/secrets`.
- **After editing anything under `infra/`** — `/audit/infra` before `terraform apply`.
- **After adding a new backend route or email path** — `/audit/secrets` (catches new env-var leaks) + `/audit/xss` (catches new HTML email surfaces).
- **Periodically (monthly)** — `/audit/all` to catch slow-moving drift. The scheduled `audit.yml` workflow covers `pnpm audit` weekly; `/audit/all` adds the other audits to the picture.

## What's intentionally not here

The source repo (`../project-running`) has audits for Postgres RLS, Edge Function JWTs, mobile-twin parity, paywall gates, privacy-zone clipping, schema-codegen drift, metadata-key registries, and architecture-guard tests. None of those apply to this stack — we're a static frontend + Hono Lambda + Sanity + PayFast site, not a Supabase / Flutter monorepo.

If MGD ever grows in any of those directions (e.g. adds Supabase, adds a mobile app, adds a multi-tier paywall), look at the omitted commands as a starting point rather than reinventing them.

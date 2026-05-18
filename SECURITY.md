# Security policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue or PR for security vulnerabilities.

There are two private channels — pick whichever is easier:

- **GitHub Security Advisories (preferred)** — file a private report at
  <https://github.com/Absence0760/meryl-green-designs/security/advisories/new>.
  Only the repo maintainers can see it until it's published.
- **Email** — <zagreenwoman@gmail.com> with subject `[security] <short summary>`.

Whichever channel you use, please include:

- A description of the vulnerability and its impact (what an attacker can do).
- Steps to reproduce, ideally a minimal PoC.
- The commit SHA or release tag where you observed it.
- Whether you intend to publish a write-up, and on what timeline.

### Disclosure process and timelines

- **Acknowledgement**: within 72 hours of receipt.
- **Triage decision** (accepted / declined / needs more info): within 7 days.
- **Fix target**: within 30 days for high / critical severity, within 90 days
  for medium / low. Complex issues may take longer — we'll keep the reporter
  in the loop.
- **Public disclosure**: coordinated with the reporter once a fix has shipped
  (or sooner if the vulnerability is already public). We credit reporters in
  the advisory unless they ask to stay anonymous.

## Scope

This repository ships with the following defensive scaffolding (full list in
`.github/workflows/`):

- **Secret scanning** — `.github/workflows/gitleaks.yml` runs gitleaks on every
  push and PR plus a weekly full-history sweep.
  `.pre-commit-config.yaml` runs the same scan locally before commit.
- **Dependency audit** — `.github/workflows/audit.yml` runs `pnpm audit` weekly
  and files an issue for any high-severity finding. Dependabot
  (`.github/dependabot.yml`) opens grouped weekly PRs for npm, pip, terraform,
  and GitHub Actions.
- **Static analysis** — `.github/workflows/codeql.yml` runs CodeQL on JS/TS and
  GitHub Actions YAML on every PR + push + a weekly cron.
- **Supply-chain posture** — `.github/workflows/scorecard.yml` runs the OpenSSF
  Scorecard weekly.
- **Infra checks** — `.github/workflows/terraform.yml` runs `terraform fmt
  -check`, `terraform validate`, and Trivy IaC scanning on `infra/**` changes.

The `docs/security.md` file in this repo covers the in-application risk
register (PayFast ITN, Sanity webhook HMAC, CORS, SOPS, OIDC) — read that for
context on how the app's trust boundaries are drawn.

## Out of scope

- Issues in third-party dependencies — please report upstream and then
  optionally let us know so we can pin a fixed version.
- Issues that require a malicious maintainer or compromised developer machine.
- Findings on the live shop's PayFast / Sanity / Resend integrations that
  belong to those vendors (report directly to them).

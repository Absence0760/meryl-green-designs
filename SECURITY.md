# Security policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email the maintainer directly. Include:

- A description of the vulnerability and its impact
- Steps to reproduce (PoC if possible)
- The commit SHA or version where you observed it

You can expect an acknowledgement within 72 hours and a triage decision within 7 days.

## Scope

This template ships with the following defensive scaffolding:

- **Secret scanning** — `.github/workflows/security.yml` runs gitleaks on every push and PR plus a weekly cron. `.pre-commit-config.yaml` runs the same scan locally before commit.
- **Dependency review** — the `dependency-review` job fails any PR that pulls in a high-severity vulnerable dependency.
- **Static analysis** — `.github/workflows/codeql.yml` runs CodeQL on the configured languages weekly and on PRs.
- **Automated updates** — `.github/dependabot.yml` opens grouped weekly PRs for npm/pip/terraform/GitHub Actions.

## Out of scope

- Issues in dependencies — please report upstream and then optionally let us know.
- Issues that require a malicious maintainer or compromised developer machine.

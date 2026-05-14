# playwright/

End-to-end test suite. Spins up the backend + frontend against a
LocalStack DynamoDB and a dedicated test-e2e Sanity dataset, then drives
the public order flow through Chromium.

## Prod-safety contract (read this before running)

The suite **never** touches production. `global-setup.ts` aborts the run
unless every check passes:

- `SANITY_DATASET` is not `production`
- `DYNAMODB_ENDPOINT` starts with `http://localhost` / `http://127.0.0.1` / `http://localstack`
- `EMAIL_BACKEND` is `file`
- `PAYFAST_SANDBOX` is `true`
- `PAYFAST_MERCHANT_ID` is the public sandbox value (`10004002`)
- `ALLOW_REAL_AWS` is unset

The backend's `src/dynamo.ts` start-up assertion is the second line of
defence (refuses to construct an AWS client without `DYNAMODB_ENDPOINT`
or `AWS_LAMBDA_FUNCTION_NAME`).

If you ever add a new env var that could touch prod, extend the guard in
`helpers/env-guard.ts` in the **same** change.

## One-time local setup

1. **Create a separate Sanity account** for the e2e suite (the operator's
   chosen pattern — register at
   [sanity.io/manage](https://www.sanity.io/manage) with a dedicated
   email like `<you>+sanity-e2e@…`). A separate *account* is stronger
   isolation than a separate *project* under the production login:
   compromise of the production account credentials can't expose the
   test dataset and vice versa, and you can hand the test-account login
   to a CI service without giving it any path to production. Use the
   Free plan; the test dataset can stay public because no PII lives in
   Sanity post-Phase-1.

   Then in that account, create a project (e.g. `meryl-green-designs-e2e`)
   with a `test-e2e` dataset, and note the project ID.

2. **Create an Editor API token** on that project (Settings → API → Tokens).
   The seed helper uses it to wipe + reseed fixtures at the start of each
   run. Scope it to the `test-e2e` dataset if Sanity offers per-dataset
   scoping on your plan.

3. **Generate a webhook secret + admin token**:

   ```bash
   echo "SANITY_WEBHOOK_SECRET=$(openssl rand -hex 32)"
   echo "ADMIN_API_TOKEN=$(openssl rand -hex 32)"
   ```

4. **Copy + fill the env file**:

   ```bash
   cp playwright/.env.example playwright/.env
   $EDITOR playwright/.env
   ```

5. **Install Playwright browsers** (once per machine):

   ```bash
   pnpm --filter @meryl-green-designs/playwright install-browsers
   ```

6. **Bring up LocalStack** (DynamoDB emulator) and the orders table:

   ```bash
   pnpm dev:db:up
   ```

## Run

```bash
pnpm --filter @meryl-green-designs/playwright test            # headless
pnpm --filter @meryl-green-designs/playwright test:headed     # see the browser
pnpm --filter @meryl-green-designs/playwright test:ui         # Playwright UI runner
```

Playwright's `webServer` config will spawn `pnpm backend dev` and
`pnpm frontend dev` on demand. The first run takes ~30 s; subsequent
runs reuse the already-listening servers.

## What's covered

Specs are grouped by feature area:

- `tests/cross-cutting/` — tests that span multiple features
- `tests/orders/` — order lifecycle (cart → checkout → tracking → webhooks)

Future areas (gallery interactions, shop browsing, contact enquiry, etc.)
get their own folder when their first spec lands; keep cross-cutting only
for genuinely-multi-area tests.

| Spec file | What it covers |
|---|---|
| `tests/cross-cutting/smoke.spec.ts` | Static-page renders across the site: home, gallery, shop, product detail, contact, /track shell, privacy, returns, terms |
| `tests/orders/cart-checkout.spec.ts` | Add-to-cart → checkout → DynamoDB PII row + Sanity skeleton + owner email + signed PayFast form |
| `tests/orders/track.spec.ts` | `/track?ref&email` happy path; wrong email returns 404 (no enumeration) |
| `tests/orders/payment-itn.spec.ts` | Simulate a PayFast ITN POST with a valid sandbox signature; verify status flips + customer email captured |
| `tests/orders/sanity-webhook.spec.ts` | Simulate a Sanity status-change webhook with a valid HMAC; verify correct customer template fires |

What's **not** covered:
- Studio's custom PII panels (`studio/components/orderPii.tsx`). The
  scope chosen here is "public + order flow"; the `/admin/*` HTTP routes
  the panels consume are covered by `backend/src/__tests__/admin.test.ts`.
- Real PayFast redirect. The cart spec asserts the form is correctly
  signed; the test intercepts the redirect to `sandbox.payfast.co.za`
  rather than navigate there (CI shouldn't depend on an external service).
- Email rendering itself. Tests read the captured `.dev-emails/*.html`
  files for subject + recipient + key copy; rendering correctness is
  covered by `backend/src/__tests__/email.test.ts`.

## CI

`.github/workflows/e2e.yml` runs the same suite on every pull request
and every push to `main`. It uses a LocalStack service container, the
public PayFast sandbox merchant, and the `test-e2e` Sanity dataset
(secrets provided via the repository's GitHub Actions environment).

If a spec fails in CI, the workflow uploads the Playwright HTML report
as an artifact — open it locally to see traces / screenshots / video.

### GitHub Actions `e2e` environment — first-time setup + reset runbook

The workflow targets a dedicated `e2e` GitHub Actions environment
(separate from the `production` environment the deploy workflows use,
so test credentials cannot reach prod). The environment must exist
and carry two variables + three secrets before the workflow can pass.

The full table of what each value is for lives in
[`docs/deployment.md § GitHub Actions environment for end-to-end tests`](../docs/deployment.md#github-actions-environment-for-end-to-end-tests-e2e).
This section is the **how-to-set-it-up** runbook — re-run any of
these commands to rotate a value.

**Prerequisites:** a separate Sanity account (see [One-time local setup](#one-time-local-setup)
step 1) with a project + Editor API token already created.

#### Create the environment and populate it

```bash
# Create the e2e environment (idempotent — succeeds if it already exists)
gh api -X PUT repos/Absence0760/meryl-green-designs/environments/e2e

# Variables (public, visible in workflow logs)
gh variable set SANITY_E2E_PROJECT_ID --env e2e --body '<paste your test project id>'
gh variable set SANITY_E2E_DATASET    --env e2e --body 'test-e2e'

# Secrets (masked in logs, set value-by-stdin for the Sanity token so it
# doesn't end up in your shell history)
gh secret set SANITY_E2E_TOKEN          --env e2e   # prompts; paste the Sanity Editor token
gh secret set SANITY_E2E_WEBHOOK_SECRET --env e2e --body "$(openssl rand -hex 32)"
gh secret set E2E_ADMIN_API_TOKEN       --env e2e --body "$(openssl rand -hex 32)"
```

`SANITY_E2E_WEBHOOK_SECRET` and `E2E_ADMIN_API_TOKEN` are random hex
values shared only between the test runner and the test backend the
workflow spawns. Neither is configured on the Sanity side — the suite
**simulates** the Sanity webhook by signing payloads itself.
`SANITY_E2E_TOKEN` is the one real Sanity-issued credential, generated
in the Sanity dashboard (Manage → API → Tokens, Editor scope).

#### Inspect what's currently set

```bash
gh variable list --env e2e
gh secret list   --env e2e   # values are never returned, only names + last-updated
```

#### Rotate a single value

Re-run the matching `set` command from the create block above —
GitHub overwrites the existing variable / secret in place.

After rotating, re-run the most recent failed workflow run so it
picks up the new value:

```bash
gh run list --workflow e2e.yml --limit 5
gh run rerun <run-id>
```

#### Reset the whole environment

If something has drifted and you want to start fresh:

```bash
gh api -X DELETE repos/Absence0760/meryl-green-designs/environments/e2e
# then re-run the "Create the environment and populate it" block above
```

Deleting the environment also drops every variable and secret stored
in it — no separate cleanup step needed.

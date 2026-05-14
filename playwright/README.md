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

1. **Create a separate test Sanity project** at
   [sanity.io/manage](https://www.sanity.io/manage). Use the Free plan;
   the dataset can stay public because no PII lives in Sanity post-Phase-1.
   Note the project ID.

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

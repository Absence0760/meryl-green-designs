# backend/

Hono app deployed two ways: local Node server for dev, AWS Lambda (fronted by API Gateway HTTP API, in turn fronted by CloudFront at `/api/*`) for prod. Dev port `3001` (`PORT` env override).

## Stack

- Hono on Node 22 — same app code runs as `@hono/node-server` locally and `hono/aws-lambda` in prod
- TypeScript, esbuild bundle (`dist/lambda.mjs`), `tsx watch` for local dev
- vitest with mocked Sanity + Resend (no network)
- `@sanity/client` for reads/writes; **Resend via raw `fetch`** — no SDK

## Commands (run from repo root)

```bash
pnpm backend dev      # tsx watch src/server.ts on :3001
pnpm backend build    # esbuild → dist/lambda.mjs
pnpm backend check    # tsc --noEmit
pnpm backend test     # vitest run
```

## Three entry points (the most important thing on this page)

- `src/app.ts` — `createApp()` builds the Hono app + middleware + routes. Pure logic.
- `src/server.ts` — local dev entry. Imports `dotenv/config` and runs `@hono/node-server`.
- `src/lambda.ts` — AWS Lambda entry. Wraps `createApp()` with `hono/aws-lambda`. **Deliberately does not import `server.ts`** so esbuild tree-shakes `dotenv` out of the Lambda bundle.

**Never add `dotenv` imports to any module reachable from `lambda.ts`.** It will end up in the deployment bundle and bloat cold starts. If you need an env var, read it from `process.env` directly inside the handler — `app.ts` and everything it imports must stay dotenv-free.

## Routes

Mounted in `src/app.ts`. Each route file lives under `src/routes/` and exports a `Hono` sub-app.

- `GET /health` — liveness
- `GET /products`, `GET /products/:slug`, `GET /gallery`, `GET /testimonials` — Sanity reads
- `POST /orders` — validate, look up prices in Sanity (server-side total — never trust client amount), create order doc, send owner email, return signed PayFast form data
- `GET /orders/:ref?email=` — email-verified track lookup. **Wrong email returns 404, not 403** (no enumeration).
- `POST /orders/:ref/retry-payment?email=` — self-service payment retry. Same no-enumeration policy (every fail path is 404). Atomic per-orderRef lifetime cap of 5 (DynamoDB `ConditionExpression`); cap placed AFTER auth checks so a wrong-email spray can't lock out a legit customer. 7-day window. See `docs/payment-retry-plan.md`.
- `POST /webhooks/sanity-order` — verify HMAC-SHA256 over **raw body** before parsing, then dispatch status email
- `POST /webhooks/payfast-itn` — verify MD5 sig **over the raw body** (PayFast signs with PHP `urlencode` and includes empty fields; re-encoding from the parsed body produces a mismatch) + amount, update order to `payment_received`
- `GET /admin/orders/:ref`, `PATCH /admin/orders/:ref/tracking`, `PATCH /admin/orders/:ref/internal-notes` — Studio-only PII routes. Gated by `Authorization: Bearer <ADMIN_API_TOKEN>` (constant-time compare). CORS narrowed to `STUDIO_ORIGINS`. Handlers may only log `orderRef + action + result` — never PII values; regression-guarded in `email.test.ts`.

## Hard rules

- **PayFast is the only payment gateway.** Don't add Stripe/Paystack/etc. without discussing.
- **Server-computed amounts only.** Look up prices in Sanity per request — never accept an amount from the client.
- **Verify webhook signatures over the raw body**, before JSON parsing. Use `crypto.timingSafeEqual`. Reject mismatches with 401.
- **CORS: `ALLOWED_ORIGINS` is the only gate.** No CSRF token (no sessions).
- **Don't send banking details in any automated email.** Regression-guarded by a test in `email.test.ts` — see `docs/security.md § Risk 1` for the impersonation rationale.
- **Use raw `fetch` for Resend, not a SDK.** Keeps the Lambda bundle tiny and the dependency surface small.
- **`email.ts` has two backends** switched by `EMAIL_BACKEND` (`resend` default, `file` for local dev). The file backend writes to `backend/.dev-emails/` and is gitignored. Production must never set `EMAIL_BACKEND=file` — Terraform doesn't pass it through.

## Testing

Tests are under `src/__tests__/`. `setup.ts` sets env vars once for every test file; individual tests can override with `vi.stubEnv()`. Tests use `app.request()` to drive the Hono app in-process — no real HTTP server, no real Sanity/Resend calls.

When you add a route, add a test file under `src/__tests__/` covering the success path and at least one failure path (validation, signature, missing env var).

## Pointers

- Architecture (backend section): `docs/architecture.md`
- Order flow design + security rationale: `docs/orders-and-tracking.md`
- Cross-cutting risk register: `docs/security.md`
- Lambda env vars: `docs/deployment.md § Environment variable reference`

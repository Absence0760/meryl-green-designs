# playwright/

End-to-end test workspace. Runs Chromium against a locally-spawned
backend + frontend, with LocalStack DynamoDB and a dedicated test-e2e
Sanity dataset. Suite is serialised (`workers: 1`) because tests share
the backend's DynamoDB state.

## Hard rules

- **The env-guard in `global-setup.ts` must not be weakened.** It's the
  primary defence against accidentally pointing tests at prod. Extend it
  when adding any new env var that could touch a production resource —
  don't bypass it.
- **Never read prod credentials in this workspace.** No `~/.aws` profile,
  no production Sanity token, no live PayFast merchant. Local dev gets
  test values from `playwright/.env`; CI gets them from a dedicated
  GitHub Actions environment.
- **All Sanity writes go to `test-e2e`.** The seed helper wipes + reseeds
  the dataset at the start of each run; if `SANITY_DATASET` is anything
  else, the run aborts before any client is constructed. The test
  dataset lives on a **separate Sanity account** from the production
  project (the operator's chosen pattern) — stronger isolation than a
  second project under the same login.
- **No external HTTP in tests.** Stub PayFast's redirect target,
  signature-verify ITN posts locally, write emails to disk instead of
  Resend. The only network call the suite makes is to the test Sanity
  project's API.
- **Don't add a second test framework.** Playwright is the test runner
  here; vitest stays in `frontend/` and `backend/`.

## Layout

- `playwright.config.ts` — webServer spawns backend + frontend with the
  test env; baseURL is `http://localhost:7777`.
- `global-setup.ts` — env guard → LocalStack table check → Sanity wipe + seed.
- `helpers/` — env-guard, Sanity seed, email reader, ITN signer, webhook
  signer. Reusable across specs.
- `fixtures/` — deterministic product / gallery / testimonial seed data.
- `tests/` — specs grouped by feature area:
  - `tests/cross-cutting/` — tests that span multiple features (smoke,
    accessibility scans, etc.).
  - `tests/orders/` — order lifecycle (cart, checkout, tracking, webhooks).
  - When a new feature area gets its first spec, add a sibling folder
    (e.g. `tests/gallery/`, `tests/contact/`). Keep `cross-cutting/`
    for genuinely-multi-area tests only.

## Pointers

- Suite scope + setup walkthrough: `playwright/README.md`
- CI workflow: `.github/workflows/e2e.yml`
- Backend prod-write refusal (defence in depth): `backend/src/dynamo.ts`

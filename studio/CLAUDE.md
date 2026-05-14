# studio/

Sanity Studio v5 (React 19) — the dashboard Meryl uses to manage products, gallery photos, testimonials, and orders. Dev port `3333`.

## Commands (run from repo root)

```bash
pnpm studio dev      # sanity dev on :3333
pnpm studio build    # sanity build
pnpm studio check    # tsc --noEmit
pnpm studio deploy   # publishes to <name>.sanity.studio (interactive first time)
```

The studio is excluded from `pnpm dev` because it's heavy. Run it with `pnpm dev:all` or on its own.

## No tests

There is no vitest config in this workspace and no test runner. **Don't add one.** Schema correctness is checked by tsc; behaviour is checked by Meryl using the studio.

## Schemas

All schemas live in `studio/schemas/` and must be registered in `schemas/index.ts`. Current schemas: `product`, `galleryPhoto`, `testimonial`, `order`.

When adding a new schema:

1. Create `studio/schemas/<name>.ts` using `defineType` + `defineField`.
2. Register it in `schemas/index.ts`.
3. If the frontend will consume it: add the matching TypeScript type and a query helper to `backend/src/sanity.ts`, plus a backend route that reads it (so the dataset can stay private). The frontend fetches from the backend, not Sanity.
4. Update `docs/features.md` with the new content type.

`docs/deployment.md § Adding a new content type` has a worked example.

## Sanity client gotchas

- Studio reads `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` from `studio/.env`. These must point at the same Sanity project as the backend's `SANITY_PROJECT_ID`.
- `studio/.env` only contains non-secret IDs, so it's a normal gitignored file (no SOPS).

## Custom field components for order PII

`studio/components/orderPii.tsx` defines three custom field components rendered on the order detail view:

- `<CustomerDetailsPanel>` — read-only display of name/email/phone/address/items/notes
- `<TrackingFields>` — three editable inputs (carrier, number, URL), save-on-blur
- `<InternalNotesField>` — editable textarea, save-on-blur

They fetch data from the backend's `/admin/orders/:ref` endpoint and write to `/admin/orders/:ref/tracking` and `/admin/orders/:ref/internal-notes` — bypassing Sanity entirely. The backend reads/writes a private DynamoDB table; the Sanity document only carries the join key (`orderRef`) and non-PII fields (status, amount, payment metadata).

Required env vars (in `studio/.env`):

- `SANITY_STUDIO_API_URL` — backend base URL the components fetch from
- `SANITY_STUDIO_ADMIN_TOKEN` — bearer token, must match the backend's `ADMIN_API_TOKEN`

The token is baked into the Studio JS bundle at build time, so it's visible to anyone who can load the Studio. CORS narrows admin access to the Studio's hosted origin, but the real auth gate is the bearer check on the backend. See `docs/orders-pii-split-plan.md § Admin auth` for the v2 hardening ideas (Sanity JWT verification, Cognito).

`resolveApiUrl()` in `orderPii.tsx` throws at module load if a production build has no `SANITY_STUDIO_API_URL` set, or if the value resolves to a loopback host (`localhost` / `127.0.0.1` / `0.0.0.0`). The check runs in the deployed JS bundle (Vite/esbuild has already substituted `process.env.NODE_ENV` to `'production'` by then). Belt-and-braces: `.github/workflows/deploy-studio.yml` also asserts `vars.PUBLIC_API_URL`, `secrets.ADMIN_API_TOKEN`, and `vars.PUBLIC_SANITY_PROJECT_ID` are all set before invoking `sanity deploy`. Development builds with no env set fall back to `http://localhost:3001`.

Phase 1 cutover landed 2026-05-13: the native PII fields are gone from `order.ts`. The schema now carries only the non-PII skeleton (`orderRef`, `status`, `paymentMethod`, `amountZar`, `paymentId`) plus three placeholder slots (`customerDetailsPanel`, `trackingPanel`, `internalNotesPanel`) backed by the components above. The Phase 0 parity-validation step is historical — see `docs/orders-pii-split-plan.md`.

## Pointers

- Order schema field semantics + status transitions: `docs/orders-and-tracking.md`
- Architecture (studio section): `docs/architecture.md`

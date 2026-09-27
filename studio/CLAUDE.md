# studio/

Sanity Studio v6 (React 19) — the dashboard Meryl uses to manage products, gallery photos, testimonials, and orders. Dev port `3333`.

## Commands (run from repo root)

```bash
pnpm studio dev      # sanity dev on :3333
pnpm studio build    # sanity build
pnpm studio check    # tsc --noEmit
pnpm studio deploy   # publishes to <name>.sanity.studio (interactive first time)
```

The studio is excluded from `pnpm dev` because it's heavy and needs a real Sanity project (see below). Run it with `pnpm dev:all` or on its own.

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

**Adding a field to an existing schema:** `initialValue` only applies to new documents — published docs keep no value until someone re-saves them. Give the backend projection a default instead of migrating. Example: `product.category` (`screen` | `cushion-cover`) is projected as `"category": coalesce(category, "screen")` in `backend/src/sanity.ts` (`PRODUCT_PROJECTION`, shared by every product query), and `content-local.ts` applies the same default.

## Desk structure + templates

`structure.ts` defines the desk (passed to `structureTool({ structure })`) and the product initial value templates (added via `schema.templates: (prev) => [...prev, ...productTemplates]` in `sanity.config.ts`). Products are a folder (All / Folding screens / Cushion covers, ordered by `order`); every other type comes from `S.documentTypeListItems()` minus `product`, so a new schema shows up automatically. The Folding screens filter includes `!defined(category)` to match the backend's `coalesce(category, "screen")`. Templates set every field explicitly rather than relying on field `initialValue` merging.

Product validation uses `.warning()` for the soft checks (no photos, no price, `dimensionsMismatch()` in `schemas/product.ts`) — keep them warnings; Meryl must always be able to publish.

## Sanity client gotchas

- Studio reads `SANITY_STUDIO_*` via the Sanity CLI's Vite-style env loading: `sanity dev` loads the committed `studio/.env.development` (non-sensitive defaults) plus a gitignored `studio/.env.development.local` (wins); `sanity build`/`deploy` run in production mode and don't read either — CI supplies the env. The project ID must point at the same Sanity project as the backend's `SANITY_PROJECT_ID`.
- The committed `SANITY_STUDIO_PROJECT_ID` is blank on purpose: the Studio is optional for local dev and needs a real Sanity project. `project-env.ts` (`requireStudioProjectId`, used by both `sanity.cli.ts` and `sanity.config.ts`) fails fast with a friendly "optional; create a free personal project" message pointing to `docs/run-locally.md § Sanity Studio (optional)`. Keep that message helpful if you touch it.

## Custom field components for order PII

`studio/components/orderPii.tsx` defines three custom field components rendered on the order detail view:

- `<CustomerDetailsPanel>` — read-only display of name/email/phone/address/items/notes
- `<TrackingFields>` — three editable inputs (carrier, number, URL), save-on-blur
- `<InternalNotesField>` — editable textarea, save-on-blur

They use `@sanity/ui` v4 layout primitives — spacing on `<Stack>` / `<Inline>` is the `gap` prop (v4 removed `space`; passing it is a type error).

They fetch data from the backend's `/admin/orders/:ref` endpoint and write to `/admin/orders/:ref/tracking` and `/admin/orders/:ref/internal-notes` — bypassing Sanity entirely. The backend reads/writes a private DynamoDB table; the Sanity document only carries the join key (`orderRef`) and non-PII fields (status, amount, payment metadata).

Required env vars (committed dev defaults in `studio/.env.development`):

- `SANITY_STUDIO_API_URL` — backend base URL the components fetch from
- `SANITY_STUDIO_ADMIN_TOKEN` — bearer token, must match the backend's `ADMIN_API_TOKEN` (locally both are `local-dev-admin-token`)

The token is baked into the Studio JS bundle at build time, so it's visible to anyone who can load the Studio. CORS narrows admin access to the Studio's hosted origin, but the real auth gate is the bearer check on the backend. See `docs/orders-pii-split.md § Admin auth` for the v2 hardening ideas (Sanity JWT verification, Cognito).

`resolveApiUrl()` in `orderPii.tsx` throws at module load if a production build has no `SANITY_STUDIO_API_URL` set, or if the value resolves to a loopback host (`localhost` / `127.0.0.1` / `0.0.0.0`). The check runs in the deployed JS bundle (Vite/esbuild has already substituted `process.env.NODE_ENV` to `'production'` by then). Belt-and-braces: `.github/workflows/deploy-studio.yml` also asserts `vars.PUBLIC_API_URL`, `secrets.ADMIN_API_TOKEN`, and `vars.PUBLIC_SANITY_PROJECT_ID` are all set before invoking `sanity deploy`. Development builds with no env set fall back to `http://localhost:3001`.

Phase 1 cutover landed 2026-05-13: the native PII fields are gone from `order.ts`. The schema now carries only the non-PII skeleton (`orderRef`, `status`, `paymentMethod`, `amountZar`, `paymentId`) plus three placeholder slots (`customerDetailsPanel`, `trackingPanel`, `internalNotesPanel`) backed by the components above. The Phase 0 parity-validation step is historical — see `docs/orders-pii-split.md`.

## Pointers

- Order schema field semantics + status transitions: `docs/orders-and-tracking.md`
- Architecture (studio section): `docs/architecture.md`

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

## Pointers

- Order schema field semantics + status transitions: `docs/orders-and-tracking.md`
- Architecture (studio section): `docs/architecture.md`

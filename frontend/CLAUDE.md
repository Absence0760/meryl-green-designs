# frontend/

SvelteKit 5 static site for Meryl Green Designs. Dev port `7777`.

## Stack

- SvelteKit 2 + Svelte 5 (runes), `@sveltejs/adapter-static`, Vite, TypeScript
- vitest (Node env, no svelte plugin in the test runtime)
- Sanity image URL builder (`@sanity/image-url`) — image URLs only, never document queries

## Commands (run from repo root)

```bash
pnpm frontend dev     # vite dev on :7777
pnpm frontend build   # emits frontend/build/ for S3
pnpm frontend check   # svelte-kit sync && svelte-check
pnpm frontend test    # vitest run
```

## Hard rules

- **Stay static.** No SSR adapter, no server-side load functions, no `$env/dynamic/private`. The S3 + CloudFront deploy depends on this.
- **No direct Sanity document queries from the frontend.** The dataset is private; the backend brokers all reads. The frontend uses Sanity only to build image URLs from the public asset CDN with the project ID baked in via `$env/static/public`.
- **No talking to Resend or other secret-bearing services.** Backend only.
- **`PUBLIC_*` vars only** in `frontend/.env`. They're build-time inlined, so changing one requires a rebuild.

## Testing gotchas

`vitest.config.ts` is intentionally separate from `vite.config.ts`: pulling in `@sveltejs/vite-plugin-svelte` conflicts with vitest's bundled Vite, and SvelteKit's own dev-server lifecycle isn't needed at test time. Consequences:

- `.svelte` and `.svelte.ts` rune modules **can't be imported** in tests. Wrap testable logic in plain `.ts` files (e.g. `cartLogic.ts` next to `cartStore.svelte.ts`) and test those.
- SvelteKit virtual modules like `$env/static/public` need `vi.mock()`.

Tests live alongside source under `src/` matching `**/*.test.ts`.

## Cart pattern

- `src/lib/cartLogic.ts` — pure functions over a cart array (add/remove/inc/dec/total). Tested.
- `src/lib/cartStore.svelte.ts` — thin `$state` wrapper that exposes the live store. Not tested directly.
- `src/lib/Cart.svelte` — slide-out panel UI that consumes the store.

When changing cart behaviour, prefer editing `cartLogic.ts` so the change is covered by tests.

## SPA fallback for dynamic routes

`/shop/[slug]` can't be enumerated at build time (slugs come from Sanity). Its `+page.ts` sets `prerender = false; ssr = false;` and `svelte.config.js` configures `fallback: '404.html'`. CloudFront's custom error response (in `infra/s3_cloudfront.tf`) rewrites 404/403 to `/404.html` with HTTP 200 so direct visits resolve without leaking a 4xx status.

If you add another dynamic route, follow the same pattern. Don't change the CloudFront error mapping to a non-200 status.

## Pointers

- Per-page feature inventory: `docs/features.md`
- Architecture (frontend section): `docs/architecture.md`
- Local dev walkthrough: `docs/run-locally.md`

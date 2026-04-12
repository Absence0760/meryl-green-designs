# Demo branch (GitHub Pages preview)

The `demo` branch hosts a free, client-previewable copy of the site on
GitHub Pages at
[https://absence0760.github.io/meryl-green-designs/](https://absence0760.github.io/meryl-green-designs/).

It is **entirely independent** of the production deploy pipeline. It does
not touch AWS, S3, CloudFront, Lambda, Route 53, or the Sanity CMS. The
live production site is unaffected by any activity on this branch.

## What the demo build changes

When `PUBLIC_DEMO_MODE=true` is set at build time:

1. **Shop page** — reads from a hardcoded array of 9 sample products
   (`frontend/src/lib/demo.ts`). No network call to `/products`.
2. **Gallery page** — reads from a hardcoded array of 10 sample photos.
   No network call to `/gallery`.
3. **Order form** — the submit handler short-circuits before the fetch,
   waits 400 ms for feedback parity with the real flow, and shows the
   existing success UI with a reference of `MG-DEMO-0000` and an extra
   "preview mode" note. No backend call is made.
4. **Sitewide banner** — a pale-amber ribbon above the header on every
   page, reading "Preview site — products are illustrative examples and
   the order form is not connected to a live backend."
5. **Images** — sample SVG placeholders in `frontend/static/demo/` are
   served instead of Sanity-hosted photos. `imageUrl()` in
   `frontend/src/lib/sanity.ts` treats any Sanity asset `_ref` starting
   with `demo:` as a local static file path prefixed with `base`.

When `PUBLIC_DEMO_MODE` is unset (normal builds), none of this code path
runs — `isDemoMode` is `false` and the app behaves identically to `dev`
and `main`.

## Architecture

```
push to `demo` branch
        │
        ▼
.github/workflows/deploy-demo.yml
        │
        │ pnpm install
        │ BASE_PATH=/meryl-green-designs
        │ PUBLIC_DEMO_MODE=true
        │ pnpm frontend build     ← adapter-static emits frontend/build/
        │
        │ actions/upload-pages-artifact@v3
        │ actions/deploy-pages@v4
        ▼
GitHub Pages  →  https://absence0760.github.io/meryl-green-designs/
```

No AWS credentials, no OIDC, no secrets. The workflow only needs the
built-in `GITHUB_TOKEN` plus the `pages: write` and `id-token: write`
permissions declared in the workflow file.

## First-time setup (one manual step)

GitHub Pages must be enabled on the repository. This is a one-off:

1. Repo Settings → **Pages**
2. Source: **GitHub Actions**
3. Save.

There is no CLI for this; it has to be done in the browser. Once enabled,
every push to `demo` will build and publish automatically. Expect the
first deploy to take 2–3 minutes; subsequent deploys with pnpm cache hits
land in about a minute.

## Updating the demo

The demo tracks the `demo` branch, not `dev` or `main`. To refresh it:

```bash
git checkout demo
git merge dev        # or cherry-pick specific commits
git push origin demo
```

The workflow fires on push, rebuilds, and republishes. No manual step.

To change sample products or images, edit `frontend/src/lib/demo.ts` (and
drop new SVG/JPG files into `frontend/static/demo/` if you are replacing
the placeholders). Commit and push — same flow.

## Previewing demo mode locally

`pnpm dev` runs the **production** code path — it hits the local Hono
backend on :3001, which talks to the real Sanity dataset. Demo mode is
gated on `PUBLIC_DEMO_MODE=true`, which is set in the GitHub Pages
workflow but not in local `.env`. To preview the demo build on your
machine:

```bash
pnpm frontend dev:demo        # vite dev with PUBLIC_DEMO_MODE=true
```

Or build the exact GitHub Pages artifact locally and preview it:

```bash
pnpm frontend build:demo      # equivalent to the CI build
pnpm frontend preview         # serves frontend/build on :8888
```

Both commands leave `frontend/.env` untouched, so you can switch back to
normal dev (`pnpm dev`) without undoing anything.

## Replacing the SVG placeholders with real photos

The 19 files in `frontend/static/demo/` (9 product and 10 gallery SVGs)
are hand-written horizon-gradient placeholders — intentional-looking but
obviously not real photography. To replace them with real images:

1. Drop JPG/PNG files into `frontend/static/demo/` with the exact
   filenames referenced in `frontend/src/lib/demo.ts`. The code picks them
   up automatically because the sentinel `demo:...` ref is filename-based.
2. Commit and push to `demo`.
3. Alternatively, edit the refs in `demo.ts` to point at your own
   filenames.

Real JPGs should be resized to ~800×800 for products and ~800×600 for
gallery photos before committing — the repo is not the place for
multi-megabyte camera originals.

## Order form behaviour in demo mode

The form validates exactly as in production (required fields, email
format, honeypot, etc.). The only behavioural difference is that on
submit:

- `handleSubmit` in `shop/+page.svelte` detects `isDemoMode` first and
  short-circuits before `fetch`.
- A 400 ms `setTimeout` simulates server latency so the "Sending…" button
  state is visible.
- The success alert appears with reference `MG-DEMO-0000` and an extra
  italic line: "(Preview mode — no order was submitted and no email has
  been sent.)".

No order document is created in Sanity (there is no Sanity in demo mode),
no Resend email is sent, and no data leaves the browser.

## What is intentionally broken in demo mode

- **Track page** (`/track?ref=...`) — still tries to fetch from the
  configured `PUBLIC_API_URL`, which is a bogus hostname in the demo
  build. Visiting this URL in demo mode shows an error state. Since
  demo mode never surfaces a tracking link (no email is sent), this page
  is unreachable from the user journey and has been left alone rather
  than stubbed.
- **Backend `/health`**, `/products`, `/gallery`, `/orders` — not called
  at all from the demo build. The real backend is untouched.

## Tearing it down

GitHub Pages is free. There is nothing to tear down unless you want to
delete the demo entirely:

1. Repo Settings → Pages → set Source to "None".
2. Delete the `demo` branch: `git push origin --delete demo`.

The production site and CI/CD pipelines are completely unaffected by
either step.

# Features

This document describes what the site currently does.

The code and UI are complete for v1. Remaining pre-launch items are content
(real banking details, real contact email, Meryl's own products and gallery
photos in Sanity Studio) — see [`roadmap.md`](./roadmap.md).

## Site-wide

- **Sticky header** with brand ("Meryl Green Designs") and navigation. The
  active route is highlighted.
- **Nature-inspired theme**: muted greens, bark accents, cream background,
  serif display type (`Georgia`/`Cormorant Garamond`) with a sans-serif body.
- **Responsive layout**: grids collapse to single column on narrow viewports.
- **Footer** with copyright and brand tagline.
- **Favicon** — brand-colored SVG "M" monogram in `static/favicon.svg`, referenced
  from `app.html` so it appears on every route, including those with
  `ssr = false`.
- **`theme-color` meta** — mobile browsers tint the address bar with the brand
  dark-green (`#2f4a25`).
- **`robots.txt`** — allows all indexable routes, disallows `/track` (which
  is per-order and useless to crawlers without query params).
- **Per-route SEO + Open Graph + Twitter Card tags** — every page has its own
  `<title>`, meta description, `og:title`, and `og:description` in
  `<svelte:head>`. Site-wide `og:type`, `og:site_name`, `og:image`, `og:url`,
  `twitter:card`, and `twitter:image` live in `+layout.svelte` and are set
  once. The hero photograph (`/two_trees.JPG`) is the default social share
  image. Absolute URLs for OG tags use `PUBLIC_SITE_URL`, baked in at build
  time.

## Home (`/`)

- **Hero** rendered across a full-bleed photograph of the African bush
  (`static/two_trees.JPG`, compressed to 643 KB at 1920 px wide). The H1
  reads "Inspired by Nature" followed by a short italic tagline. The hero
  image is preloaded via `<link rel="preload" as="image">` so the first
  paint shows the photograph immediately.
- **Story** section with Meryl's five-paragraph introduction to The Green
  Collection, covering where the work comes from, the materials (Meranti
  hardwood frames, 100% cotton canvas), and what she's trying to evoke.
- **Poem** section on an alternate background, rendering "Africa" (author
  unknown) as three stanzas with a styled blockquote and leaf-green accent.
- **Call-to-action cards** linking to the Gallery and Shop.

## Gallery (`/gallery`)

- **Photos managed in Sanity Studio.** Meryl uploads photos, writes captions,
  sets display order, and toggles visibility from the same studio she uses
  for products and orders. No dev involvement needed to add or remove gallery
  photos.
- **Responsive tile grid** (minimum 240 px per tile). Each tile shows a photo
  cropped to a consistent 4:3 aspect ratio via `object-fit: cover`, with an
  optional caption below.
- **Runtime fetch from the backend**: the page prerenders a static shell with
  the heading, lede, and 8 shimmering skeleton tiles. After hydration,
  `onMount` calls `GET /gallery` on the backend, the skeletons swap for real
  tiles, and images lazy-load as the user scrolls.
- **Images served by Sanity's CDN** with auto-format conversion and resized
  to 640 px width. Meryl can upload any size from her camera; the browser
  never downloads the original.
- **Empty state** shown when no photos have been published yet.
- **Error state** shown if the backend is unreachable — clears the skeletons
  and prompts the visitor to refresh.
- **`prefers-reduced-motion` guard** — skeleton shimmer animation disabled
  for users who've opted out of motion.
- **Backend-mediated reads** keep the Sanity dataset private; the frontend
  never calls Sanity's query API directly.

## Shop (`/shop`)

- **Product grid rendered at runtime from the backend.** The page prerenders
  a static shell with heading, lede, and 6 shimmering skeleton cards. After
  hydration, `onMount` calls `GET /products`, the skeletons swap for real
  cards, and product photos lazy-load from Sanity's CDN (capped at 640 px
  wide, not the original upload resolution).
- **Product card layout** — name, optional blurb, optional multi-line
  description, price (formatted as ZAR), "Enquire / Order" button. Cards
  are flexbox-columns with `margin-top: auto` on the price row so prices and
  buttons stay on the same baseline across cards regardless of how much
  text is above them.
- **Empty state** when no products have been published. **Error state**
  when the backend is unreachable.
- **"Enquire / Order" button** pre-fills the order form's items field with
  `1 x {product name} — R{price}` and smooth-scrolls to the form. Multiple
  clicks append new lines so customers can order several items in one submit.
- **Order form** with fields for name, email, phone (optional), shipping
  address, items, and notes. All inputs have proper `name`, `id`,
  `autocomplete`, and `inputmode` attributes so mobile autofill and form
  fillers work correctly. Required fields show a red `*` and a legend
  explains the marker. The submit button is full-width and visibly primary.
  A hidden honeypot field (`name="website"`, offscreen-absolute) deters
  simple bots.
- **Submission flow**: the form POSTs JSON to the backend's `/orders`
  endpoint. On success, the form is replaced by a confirmation showing the
  unique order reference (`MG-YYMMDD-XXXX`). On failure, an error alert is
  shown and the form remains editable.
- **EFT payment details** section with a bank details card. The real account
  number, branch code, etc. are marked as "To be provided".

## Contact (`/contact`)

- Minimal stub with an email link. A real contact form can be added later or the
  shop order form can be repurposed for general enquiries.

## Track order (`/track`)

- **Customer-facing order status page.** The customer enters their order
  reference + email and sees the current status, a progress indicator
  (Pending payment → Payment received → Shipped → Delivered), and the
  tracking number / carrier / tracking URL once the order has shipped.
- **Deep-linked from the confirmation email** — each order confirmation
  includes a URL like `/track?ref=MG-XXX&email=…` that pre-fills and
  auto-submits the lookup form on load, so the customer clicks once and
  lands on their order.
- **Client-rendered shell + backend lookup** — the page is a prerendered
  empty shell that hydrates in the browser and calls `GET /orders/:ref` on
  the backend. The backend verifies the email matches and returns a
  sanitised subset of the order (no internal notes, no phone, no shipping
  address).
- **Email-verified lookup** — a wrong email returns the same 404 as a wrong
  reference, so an attacker can't enumerate valid references even if they
  guess the format.
- **Not listed in the main nav** — customers arrive from the email link or
  a direct bookmark, not via site discovery.

## Content management (Sanity Studio)

- **Studio package** (`studio/`) — a standalone Sanity Studio v3 app that the
  shop owner logs into to manage products and orders. Runs locally during
  development and is deployed to a free `*.sanity.studio` URL for production
  use.
- **Product schema** with fields: name, slug (auto-generated), blurb,
  description, price (ZAR), photos (with alt text and hotspot cropping),
  availability toggle, and display order.
- **Order schema** with fields: order reference (read-only), status (radio:
  pending payment → payment received → shipped → delivered → cancelled),
  customer details, shipping address, items, tracking info, and private
  internal notes. Meryl edits these; the backend creates them on order
  submission.
- **Gallery photo schema** with fields: image (with alt text and hotspot
  cropping), caption, visible toggle, and display order. Meryl uploads
  photos here to populate the `/gallery` page.
- **Availability toggle** lets the owner hide a product from the site without
  deleting it — useful for sold-out items they may restock.
- **Display order** controls the order products appear in the grid. Using 0,
  10, 20 leaves gaps for inserting new products without renumbering everything.
- **Image handling** is provided by Sanity's CDN — automatic format
  conversion, resizing, and hotspot-aware cropping. No manual image
  optimisation needed.
- **Runtime content fetch**: the frontend fetches products and gallery
  photos on every visit, from the backend, which in turn reads from
  Sanity with its API token. Meryl's edits appear within seconds of
  clicking Publish — no rebuild needed. The `deploy-frontend.yml` workflow
  still accepts `repository_dispatch` events for content that's baked at
  build time (e.g. if the home page story ever moves into Sanity), but
  products and gallery don't currently require it.
- **Automated status emails**: when Meryl changes an order's `status` field
  in the studio and publishes, a separate Sanity webhook calls the backend's
  `/webhooks/sanity-order` endpoint, which verifies the signature and sends
  the appropriate customer email (payment received / shipped / delivered /
  cancelled). See [`orders-and-tracking.md`](./orders-and-tracking.md) for
  the full flow.

## Backend behaviour

- **Routes**:
  - `GET /health` — uptime check, returns `{ ok: true }`
  - `POST /orders` — create a new order (validates, creates Sanity doc,
    sends owner notification + customer confirmation)
  - `GET /orders/:ref?email=…` — email-verified order lookup for the
    customer-facing `/track` page
  - `POST /webhooks/sanity-order` — receives Sanity webhook on order update,
    verifies HMAC-SHA256 signature, sends the matching status email
- **Validation**: required fields (name, email, address, items) must be present;
  email must look like an email; fields have maximum lengths.
- **Order reference**: generated server-side as `MG-{YY}{MM}{DD}-{4 random
  alphanumerics}`. Stored on the Sanity order document as `orderRef`.
- **Sanity-backed order storage**: every submitted order becomes a Sanity
  document, visible in Studio. Meryl manages the order lifecycle by editing
  the `status` field in Studio.
- **Status-keyed email templates**: all customer emails live in
  `backend/src/email-templates.ts`, keyed by order status. Adding a new status
  or changing wording happens in one file.
- **Owner notification**: sent immediately on order creation. Reply-to is set
  to the customer's email, so hitting reply goes straight to the customer.
- **Webhook signature verification**: `/webhooks/sanity-order` verifies
  HMAC-SHA256 over the raw request body against `SANITY_WEBHOOK_SECRET` using
  `crypto.timingSafeEqual` before taking any action.
- **CORS**: only origins in `ALLOWED_ORIGINS` can call the API from a browser.

## What is intentionally not included

See [roadmap.md](./roadmap.md) for the full list. Notable absences:

- No card payments — EFT only.
- No stock tracking or inventory counts. Availability is a simple on/off toggle.
- No CMS for home page text, poem, or gallery photos — only products and
  orders are currently managed in Sanity. (Easy to extend; see the roadmap.)
- No customer accounts or login. Order tracking is key-based (order ref +
  email), not session-based.
- No search.
- No progressive enhancement on the order form: JavaScript is required to submit
  it, because the backend is a different origin.
- No structured order line items — the order form still uses a free-form items
  textarea, pre-filled from product clicks. Meryl manually reads what was
  ordered from the Studio / order email.
- No refund handling in the data model — the `cancelled` status doesn't
  distinguish between "never paid" and "refunded".

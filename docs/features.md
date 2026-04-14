# Features

This document describes what the site currently does.

The code and UI are complete for v1. Remaining pre-launch items are content
(real contact email, Meryl's own products and gallery photos in Sanity
Studio) and Meryl's reusable banking-details reply block (a saved email
snippet, not anything in the repo) — see [`roadmap.md`](./roadmap.md).

## Site-wide

- **Announcement bar** — thin leaf-dark strip above the header with
  "Free shipping across South Africa · Secure checkout via PayFast".
  First thing any visitor sees; addresses the two biggest trust
  questions before the header even appears.
- **Sticky header** with brand ("Meryl Green Designs") and navigation. The
  active route is highlighted. On narrow viewports (< 620px) the inline
  nav is replaced with a hamburger (|||) button that opens a **small
  popup dropdown** anchored below the header on the left — a floating
  cream card with a soft shadow, not a full-screen takeover. A
  transparent backdrop captures taps outside to close. Escape and
  link-click also close. The popup lives inside the `<header>`
  element so its absolute positioning stays correctly pinned as the
  sticky header scrolls.
- **Shared `<Button>` component** in `frontend/src/lib/Button.svelte`
  with four variants (primary, outlined, ghost, ghost-primary) and
  two sizes. Renders either a `<button>` or an `<a>` depending on
  whether `href` is supplied, so the same styles serve both form
  submits and nav links. Hero, shop, track, and detail pages all use
  it — visual drift between buttons is now impossible without
  editing the shared component.
- **Sticky footer** — the layout is a flex column (`body { min-height:
  100vh; display: flex }` + `main { flex: 1 }`) so on short pages the
  footer is pushed to the bottom of the viewport instead of floating
  mid-page.
- **Footer trust strip** — three pill-chips above the copyright line:
  shipping reassurance, PayFast reassurance, and the accepted payment
  methods. Same pattern as established-retailer footers, reduces
  abandonment for first-time buyers.
- **Nature-inspired theme**: muted greens, warm bark/ochre accents
  (prices, hover states, CTA arrows), cream background, editorial serif
  display type (`Fraunces`, variable, loaded from Google Fonts with
  `preconnect` + `display=swap`; falls back to Georgia / Cormorant
  Garamond) paired with a sans-serif body.
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
  reads "Inspired by Nature" followed by a short italic tagline and two
  CTA buttons: a primary cream-filled "Shop the collection" and a ghost
  "View gallery" outlined in cream. The hero image is preloaded via
  `<link rel="preload" as="image">` so the first paint shows the
  photograph immediately.
- **Story** section with Meryl's three-paragraph introduction to The Green
  Collection, covering where the work comes from and what she's trying to
  evoke. Materials detail (Meranti hardwood frames, 100% cotton canvas)
  lives on the Shop page as a compact spec block rather than here, so the
  story stays narrative.
- **Testimonials band** — if one or more testimonials are published in
  Sanity (`testimonial` document type: quote, author, optional
  location, visibility toggle, display order), they render above the
  featured-photographs band as a grid of blockquotes with a bark
  quote-mark ornament. The section only renders when there are
  published testimonials — no placeholder, no fake content.
- **Featured photographs band** — a full-bleed four-across grid (two-up on
  narrow viewports) of the first four gallery photos, fetched at runtime
  from `GET /gallery`. Each tile links through to the gallery page and
  has a subtle hover zoom. The band only renders if the fetch returns
  photos, so it silently no-ops when the backend is unreachable. Breaks
  up the text-heavy middle of the home page and previews the gallery.
- **Poem** section on an alternate background, rendering "Africa" (author
  unknown) as three stanzas with a styled blockquote and leaf-green accent.
- **Call-to-action cards** linking to the Gallery and Shop.

## Gallery (`/gallery`)

- **Photos managed in Sanity Studio.** Meryl uploads photos, writes captions,
  sets display order, and toggles visibility from the same studio she uses
  for products and orders. No dev involvement needed to add or remove gallery
  photos.
- **Justified flex-wrap layout**, centred. Each tile's `flex-basis`
  scales with its aspect ratio (parsed from the Sanity asset `_ref`,
  which embeds `{width}x{height}`), so landscape photos take more
  row-width than portraits. Tiles don't flex-grow, so with few photos
  they sit at their natural size and cluster in the middle instead of
  stretching oversized to fill the row. Each tile has a soft cream
  background and light drop shadow so it reads as a framed print — this
  also hides the uneven cutout edges on product uploads saved as
  transparent PNGs. Optional italic caption renders centred below.
- **Click-to-enlarge lightbox** — clicking a tile opens a full-screen
  modal with the image at up to 1800 px, caption, and prev/next controls.
  Keyboard support: `Escape` closes, `←`/`→` navigate. Clicking the
  backdrop also closes.
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
- **Materials spec block** directly below the lede — a compact two-row
  definition list (`Frame`, `Canvas`) describing the shared construction of
  every piece. Styled as plain labelled facts rather than prose, so it
  doesn't compete with the product grid for attention.
- **Minimal tile layout** — each tile is a square photograph with only
  the product name (body font, small caps) and price (display font,
  bark/ochre accent) beneath; the "Add to order" button is a small
  outlined pill in the leaf-dark colour. No card chrome (no border, no
  panel, no drop shadow) and no page backdrop behind the grid — products
  sit on the page's plain cream surface so the photograph is the entire
  visual. Blurb and description are intentionally omitted from the tile —
  they're intended to live on a future per-product detail page once the
  catalogue grows. A subtle cream `background-color` is applied to the
  image itself so product uploads with transparent PNG backgrounds
  render consistently; real lifestyle photography hides the cream
  entirely.
- **Dimensions** — optional free-form string field on each product
  (`dimensions` in Sanity), rendered as a small italic subtitle between
  the product name and price. Kept free-form rather than structured
  (width/height/depth) so Meryl can write what makes sense per piece —
  e.g. "150 × 180 cm · 3 panels" or "1.5m tall, folding".
- **Hover-reveal second image** — if a product has two or more photos
  in Sanity, the first shows by default and the second cross-fades in
  on hover (or keyboard focus). Typical pattern: upload a wide
  establishing shot as `photos[0]` and a tighter detail crop as
  `photos[1]`. Gracefully no-ops for touch devices (`@media (hover:
  none)`) and for products with only one photo.
- **Clicking a tile opens the product detail page** at
  `/shop/[slug]`. The tile wraps the image and text block in an
  anchor; the "Add to order" button stays outside the anchor so it
  performs its own action.

### Product detail (`/shop/[slug]`)

- **Full-information page** for each product. Breadcrumb (Shop /
  Product name) at the top, a two-column layout with the photo
  gallery on the left and product info on the right that stacks on
  narrow viewports.
- **Photo gallery** — main photo at the top with click-to-switch
  thumbnails below. Gracefully handles 1, 2, or many photos.
- **Product info block** — name, blurb, price (bark accent), optional
  dimensions in a labelled key/value block, "Add to order" button +
  "← Back to shop" link, full description (respects newlines), and a
  compact materials spec (Frame, Canvas) mirroring the shop page
  block.
- **Slug-routed** — fetches `GET /products/:slug` on mount and
  renders the first matching available product. Unknown or
  unpublished slugs render a "Product not found" state linking back
  to the shop.
- **Not prerendered** — static adapter can't enumerate Sanity-driven
  slugs at build time. The page ships a minimal shell with a skeleton
  that swaps for real content after hydration.
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
- **Cart with quantity controls** — clicking "Add to order" on a product
  adds it to a cart summary above the order form. Quantities are adjustable
  with +/- buttons. The cart total is computed and displayed. The backend
  verifies prices against Sanity to prevent tampering.
- **PayFast payment** — clicking "Pay now" redirects the customer to
  PayFast's hosted payment page. After payment, they land on
  `/payment/complete`. PayFast sends an ITN (server-to-server callback)
  to the backend, which auto-updates the order status to "Payment received"
  in Sanity — triggering the existing automated status email. No card data
  ever touches our server. Supports credit/debit cards, Apple Pay, Google
  Pay, SnapScan, and 18+ other South African payment methods.
- **"Secure checkout" panel** — single reassurance sentence noting
  PayFast handles payment and the site never sees card details, plus
  a row of accepted-method chips (cards, Apple Pay, SnapScan, Instant
  EFT). Replaces the earlier procedural 5-step list.

## Contact (`/contact`)

- Quiet standard-section header (eyebrow + H1) with a warm invitation
  lede — no decorative hero, since a contact page is a destination for
  existing intent, not an editorial surface.
- **Contact details list** — structured key/value rows (Email, Phone,
  Studio, Response time) in a two-column layout that stacks on narrow
  viewports. Top and bottom rules give it visual weight without a
  card.
- **Commissions block** — calls out that Meryl takes bespoke
  commissions, with instructions on how to enquire.
- **Existing orders block** — links to `/track` for customers who just
  want to check a placed order.
- A real contact form can be added later or the shop order form can be
  repurposed for general enquiries.

## Privacy policy (`/privacy`)

- **POPIA-first policy** describing the actual data flows of the site
  (Sanity, PayFast, Resend, AWS, Google Fonts), the purposes for which
  personal information is collected, retention, user rights under POPIA
  (access, correction, deletion, objection, complaint), and additional
  GDPR rights for EU/UK visitors.
- **`noindex` meta** so the policy doesn't compete with the main pages
  in search results.
- Linked from the site footer alongside Contact.
- **Maintenance note:** the source file carries a comment reminding
  whoever edits it that a privacy policy is a legal document and
  should be reviewed by a South African legal professional before
  going live under the business name, especially for POPIA
  responsible-party language and cross-border transfer disclosures.
  The "Last updated" date must be bumped whenever data flows or
  wording change.

## Track order (`/track`)

- **Water page-header** — short 30vh decorative strip using `water2.JPG`
  with the same overlay treatment as the contact page, framing the
  lookup form.
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
- **Testimonial schema** with fields: quote, author, optional location,
  visible toggle, and display order. The home page only shows
  testimonials if at least one is published — the section silently
  disappears when there are none, so the default empty state on a
  brand-new install is clean.
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

- ~~No card payments — EFT only.~~ Payments are now via PayFast (cards, Apple Pay, etc.).
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

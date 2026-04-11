# Features

This document describes what the site currently does. Content (the real story,
poem, photographs, and banking details) is still placeholder text that will be
filled in before launch.

## Site-wide

- **Sticky header** with brand and navigation. The active route is highlighted.
- **Nature-inspired theme**: muted greens, bark accents, cream background, serif
  display type (`Georgia`/`Cormorant Garamond`) with a sans-serif body.
- **Responsive layout**: grids collapse to single column on narrow viewports.
- **Footer** with copyright and the collection tagline.

## Home (`/`)

- **Hero** with the eyebrow "Meryl Green Designs" and the heading "Inspired by
  Nature", rendered across a full-bleed photograph of the African bush.
- **Story** section with a placeholder paragraph to be replaced with the real
  text.
- **Poem** section on an alternate background with a styled blockquote and leaf
  accent.
- **Call-to-action cards** linking to the Gallery and Shop.

## Gallery (`/gallery`)

- **Photos managed in Sanity Studio.** Meryl uploads photos, writes captions,
  sets display order, and toggles visibility from the same studio she uses
  for products and orders. No dev involvement needed to add or remove gallery
  photos.
- **Responsive tile grid** (minimum 240px per tile). Each tile shows a photo
  cropped to a consistent 4:3 aspect ratio via `object-fit: cover`, with an
  optional caption below.
- **Images served by Sanity's CDN** with auto-format conversion and resized
  to 800px width at request time. No manual optimisation — Meryl can upload
  any size straight from her camera.
- **Empty state** shown when no photos have been added yet, so the page still
  looks intentional before Meryl populates it.
- **Build-time fetch** through the backend's `GET /gallery` endpoint, same
  pattern as the shop. The Sanity dataset stays private; the frontend never
  calls Sanity's query API directly.

## Shop (`/shop`)

- **Product grid** rendered from the Sanity CMS. Each product card shows the
  main photo, name, blurb, and price (formatted as ZAR). When there are no
  products yet, a friendly empty state is shown instead.
- **"Enquire / Order" button** on each card pre-fills the order form's items
  field with `1 x {product name} — R{price}` and smooth-scrolls to the form.
  Clicking multiple products appends each one as a new line, so customers can
  order several items from a single product browse.
- **Order form** with fields for name, email, phone (optional), shipping address,
  items, and notes. Validation is client-side and server-side. A hidden honeypot
  field deters simple bots.
- **Submission flow**: the form POSTs JSON to the backend's `/orders` endpoint.
  On success, the form is replaced by a confirmation showing the unique order
  reference (`MG-YYMMDD-XXXX`). On failure, an error message is shown and the
  form remains editable.
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
- **Build-time content fetch**: the frontend pulls products at build time via
  a GROQ query. After an edit in the studio, the site must be rebuilt to
  reflect the change. The CI workflow for this exists
  (`.github/workflows/deploy-frontend.yml` accepts `repository_dispatch`
  events); a Sanity webhook wires publish events to it — see
  [`deployment.md`](./deployment.md) for the wiring step.
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

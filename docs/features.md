# Features

This document describes what the site currently does. Content (the real story,
poem, photographs, and banking details) is still placeholder text that will be
filled in before launch.

## Site-wide

- **Under-construction banner** across the top of every page, stating that the
  site is still being built.
- **Sticky header** with brand and navigation. The active route is highlighted.
- **Nature-inspired theme**: muted greens, bark accents, cream background, serif
  display type (`Georgia`/`Cormorant Garamond`) with a sans-serif body.
- **Responsive layout**: grids collapse to single column on narrow viewports.
- **Footer** with copyright and the collection tagline.

## Home (`/`)

- **Hero** with the eyebrow "The Green Collection" and the heading "Inspired by
  Nature". A background image slot is reserved for the lead photograph. Until
  supplied, a subtle diagonal pattern fills the space.
- **Story** section with a placeholder paragraph to be replaced with the real
  text.
- **Poem** section on an alternate background with a styled blockquote and leaf
  accent.
- **Call-to-action cards** linking to the Gallery and Shop.

## Gallery (`/gallery`)

- Responsive tile grid (minimum 240px per tile) with 8 placeholder tiles.
- Each tile has an image area and caption ready for real content. Tiles are
  designed to degrade gracefully if fewer photos are supplied.

## Shop (`/shop`)

- **Product grid** with 4 placeholder cards. Each card has an image slot,
  product name, blurb, price, and an "Enquire / Order" button that jumps to the
  order form.
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

## Backend behaviour

- **Validation**: required fields (name, email, address, items) must be present;
  email must look like an email; fields have maximum lengths.
- **Order reference**: generated server-side as `MG-{YY}{MM}{DD}-{4 random
  alphanumerics}`.
- **Emails**: two are sent per order — one to the owner with the order details,
  one to the customer with their reference and the banking details. Templates
  live inline in `backend/src/routes/orders.ts`.
- **Reply-to**: the owner email has the customer address as reply-to, so hitting
  reply goes straight to the customer.
- **CORS**: only origins in `ALLOWED_ORIGINS` can call the API from a browser.
- **Health check**: `GET /health` returns `{ ok: true }` for uptime monitoring.

## What is intentionally not included

See [roadmap.md](./roadmap.md) for the full list. Notable absences:

- No database — orders exist only as emails.
- No card payments — EFT only.
- No stock tracking or inventory.
- No CMS — content is edited in the source files.
- No customer accounts or login.
- No search.
- No progressive enhancement on the order form: JavaScript is required to submit
  it, because the backend is a different origin.

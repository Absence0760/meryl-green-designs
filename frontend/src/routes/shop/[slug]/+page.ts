// Product detail page: prerendering is disabled because the slugs are
// content-driven (from Sanity). The static adapter can't know which slugs
// exist at build time without pulling from Sanity, and we don't want to
// couple the build step to a live CMS fetch. Instead the page ships a
// minimal shell that hydrates and fetches the product by slug on mount.
//
// Trade-off: the HTML doesn't include the product content on first load,
// so it won't appear in search engines as effectively as a prerendered
// version. If SEO for product pages becomes important, revisit this by
// enumerating slugs at build time via a Sanity fetch in svelte.config or
// a `+page.server.ts` with prerender entries.
export const prerender = false;
export const ssr = false;

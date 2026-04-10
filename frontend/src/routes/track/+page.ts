// The track page is fully client-rendered: it fetches order status from the
// backend at runtime using query params. We still prerender an empty shell
// (for the HTML file + layout) and disable SSR so the component only runs in
// the browser, avoiding any server-side window access.
export const prerender = true;
export const ssr = false;

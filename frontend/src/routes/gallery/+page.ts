// Gallery follows the same pattern as /shop: prerendered HTML shell with
// the skeleton loading state baked in, then `onMount` in +page.svelte
// fetches the real photo list client-side. See shop/+page.ts for the
// rationale on keeping SSR enabled.
export const prerender = true;

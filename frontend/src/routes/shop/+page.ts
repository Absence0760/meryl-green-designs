// Shop is prerendered to a static shell that includes the skeleton loading
// state baked in — so visitors see the page layout and loading placeholders
// instantly from HTML. Once the client hydrates, `onMount` in +page.svelte
// fetches real product data from the backend and swaps in the results.
//
// Keeping SSR enabled (the default) is what makes the skeleton appear in
// the prerendered HTML — setting `ssr = false` would produce an empty
// shell that only fills in after JavaScript boots, which is a worse first
// paint experience.
export const prerender = true;

// Copy for the root +error.svelte page. Kept in a plain .ts file so vitest
// can cover it (see frontend/CLAUDE.md § Testing gotchas).
//
// The raw `page.error.message` is deliberately never shown: for
// unexpected errors SvelteKit's message is generic anyway, and a future
// hook could put something internal in it.

export type ErrorCopy = {
	/** Full document <title>. */
	title: string;
	/** Small uppercase line above the heading. */
	eyebrow: string;
	heading: string;
	body: string;
	/** 404s point at the shop; everything else offers a retry. */
	notFound: boolean;
};

const SITE = 'Meryl Green Designs';

export function errorCopy(status: number): ErrorCopy {
	if (status === 404) {
		return {
			title: `Page not found — ${SITE}`,
			eyebrow: 'Page not found',
			heading: 'This path leads off into the bush…',
			body: "The page you're looking for has wandered off — it may have moved, or the link may be mistyped. Let's get you back on the trail.",
			notFound: true
		};
	}
	return {
		title: `Something went wrong — ${SITE}`,
		eyebrow: Number.isInteger(status) && status > 0 ? `Error ${status}` : 'Error',
		heading: 'Something went wrong',
		body: "We couldn't load this page just now. Please try again in a moment — if it keeps happening, get in touch.",
		notFound: false
	};
}

// Stable, URL-safe ids for page headings — used for the legal pages'
// "On this page" table of contents (LegalToc.svelte) and any deep link
// to a section (/terms#payment). Pure so it's testable under vitest.
//
// The ids are written into the page markup as literal `id="…"`
// attributes (so they prerender and work without JS);
// legalPages.test.ts checks every h2's id still equals what this helper
// produces from its text, so a reworded heading can't silently drift.

export type TocEntry = { id: string; title: string };

/** Turn heading text into a slug: "Delivery, risk, and ownership" → "delivery-risk-and-ownership". */
export function slugify(text: string): string {
	const slug = text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip combining accents (é → e)
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/['‘’]/g, '') // "Magistrates' Court" → "magistrates-court"
		.replace(/[^a-z0-9]+/g, '-') // spaces, dashes (– —), punctuation → one hyphen
		.replace(/^-+|-+$/g, '');
	return slug || 'section';
}

/**
 * Slugs for a list of headings, in order. Repeats get `-2`, `-3`, …
 * (skipping any suffix another heading already produces), so every id on
 * the page is unique.
 */
export function uniqueSlugs(texts: readonly string[]): string[] {
	const base = texts.map(slugify);
	const taken = new Set<string>();
	return base.map((slug) => {
		let id = slug;
		for (let n = 2; taken.has(id); n++) id = `${slug}-${n}`;
		taken.add(id);
		return id;
	});
}

/** Table-of-contents entries for a list of heading texts. */
export function buildToc(titles: readonly string[]): TocEntry[] {
	const ids = uniqueSlugs(titles);
	return titles.map((title, i) => ({ id: ids[i]!, title }));
}

/**
 * The section the reader is in: the last heading (in document order)
 * whose top has scrolled up to the `line` (px from the viewport top,
 * just under the sticky header). Before the first heading reaches the
 * line — i.e. while reading the intro — nothing is current.
 */
export function currentSection(
	headings: ReadonlyArray<{ id: string; top: number }>,
	line: number
): string | null {
	let current: string | null = null;
	for (const h of headings) {
		if (h.top <= line) current = h.id;
		else break;
	}
	return current;
}

// Guards the "On this page" wiring on the legal pages. The .svelte files
// can't be compiled under vitest (see frontend/CLAUDE.md), so this reads
// their source: every <h2> must carry the id headingSlug produces from
// its text, and the page's buildToc([...]) list must name the same
// headings in the same order — a reworded or added heading that isn't
// mirrored in the TOC fails here rather than shipping a dead link.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { uniqueSlugs } from './headingSlug';

const ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&mdash;': '—',
	'&ndash;': '–',
	'&ldquo;': '“',
	'&rdquo;': '”',
	'&lsquo;': '‘',
	'&rsquo;': '’',
	'&nbsp;': ' '
};

function decode(html: string): string {
	return html.replace(/&[a-z]+;/g, (e) => {
		const decoded = ENTITIES[e];
		if (decoded === undefined) throw new Error(`Unhandled entity ${e} in a heading`);
		return decoded;
	});
}

function readPage(route: string): string {
	return readFileSync(
		fileURLToPath(new URL(`../routes/${route}/+page.svelte`, import.meta.url)),
		'utf8'
	);
}

describe.each(['terms', 'returns', 'privacy'])('/%s table of contents', (route) => {
	const src = readPage(route);
	// Headings live in the markup; skip the <script> (whose comments
	// mention "<h2>") and any HTML comments.
	const markup = src
		.replace(/<script[\s\S]*?<\/script>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
	const h2s = [...markup.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)].map((m) => ({
		attrs: m[1]!,
		text: decode(m[2]!.replace(/\s+/g, ' ').trim())
	}));

	it('has headings to list', () => {
		expect(h2s.length).toBeGreaterThan(3);
	});

	it('gives every h2 a plain-text body (no nested markup to lose in the TOC)', () => {
		for (const h of h2s) expect(h.text).not.toMatch(/[<>{}]/);
	});

	it('gives every h2 the slug of its own text as a literal id', () => {
		const ids = h2s.map((h) => h.attrs.match(/\bid="([^"]+)"/)?.[1] ?? null);
		expect(ids).toEqual(uniqueSlugs(h2s.map((h) => h.text)));
	});

	it('lists exactly the h2 headings, in order, in buildToc([...])', () => {
		const list = src.match(/buildToc\(\[([\s\S]*?)\]\)/);
		expect(list).not.toBeNull();
		const titles = [...list![1]!.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) =>
			m[1]!.replace(/\\'/g, "'")
		);
		expect(titles).toEqual(h2s.map((h) => h.text));
	});

	it('renders the TOC in both layouts', () => {
		expect(src).toContain('<LegalToc {sections} />');
		expect(src).toContain('<LegalToc {sections} variant="inline" />');
	});
});

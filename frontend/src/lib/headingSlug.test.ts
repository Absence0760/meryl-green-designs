import { describe, it, expect } from 'vitest';
import { buildToc, currentSection, slugify, uniqueSlugs } from './headingSlug';

describe('slugify', () => {
	it('lower-cases and hyphenates words', () => {
		expect(slugify('Who you are contracting with')).toBe('who-you-are-contracting-with');
	});

	it('spells out an ampersand', () => {
		expect(slugify('Terms & Conditions')).toBe('terms-and-conditions');
		expect(slugify('Q&A')).toBe('q-and-a');
	});

	it('collapses em/en dashes and hyphens into one hyphen', () => {
		expect(slugify('Made-to-order — lead times')).toBe('made-to-order-lead-times');
		expect(slugify('Pages 3–5')).toBe('pages-3-5');
		expect(slugify('a -- b')).toBe('a-b');
	});

	it('drops punctuation, quotes and apostrophes', () => {
		expect(slugify('Delivery, risk, and ownership')).toBe('delivery-risk-and-ownership');
		expect(slugify('“Quoted” (heading)?!')).toBe('quoted-heading');
		expect(slugify("Magistrates' Court")).toBe('magistrates-court');
		expect(slugify('Meryl’s studio')).toBe('meryls-studio');
	});

	it('strips accents', () => {
		expect(slugify('Café décor')).toBe('cafe-decor');
	});

	it('trims leading/trailing separators and whitespace', () => {
		expect(slugify('  — Children —  ')).toBe('children');
	});

	it('keeps digits', () => {
		expect(slugify('Section 22 of POPIA')).toBe('section-22-of-popia');
	});

	it('falls back to "section" when nothing is left', () => {
		expect(slugify('')).toBe('section');
		expect(slugify('— ! —')).toBe('section');
	});
});

describe('uniqueSlugs', () => {
	it('leaves distinct headings alone', () => {
		expect(uniqueSlugs(['Payment', 'Pricing'])).toEqual(['payment', 'pricing']);
	});

	it('suffixes repeats with -2, -3 in order', () => {
		expect(uniqueSlugs(['Notes', 'Notes', 'Notes'])).toEqual(['notes', 'notes-2', 'notes-3']);
	});

	it('treats headings that slug the same as repeats', () => {
		expect(uniqueSlugs(['Q & A', 'Q and A'])).toEqual(['q-and-a', 'q-and-a-2']);
	});

	it('skips a suffix another heading already produces', () => {
		const ids = uniqueSlugs(['Notes 2', 'Notes', 'Notes']);
		expect(ids).toEqual(['notes-2', 'notes', 'notes-3']);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('buildToc', () => {
	it('pairs each title with its unique id, keeping the original text', () => {
		expect(buildToc(['Made-to-order — lead times', 'Payment', 'Payment'])).toEqual([
			{ id: 'made-to-order-lead-times', title: 'Made-to-order — lead times' },
			{ id: 'payment', title: 'Payment' },
			{ id: 'payment-2', title: 'Payment' }
		]);
	});

	it('returns an empty list for no headings', () => {
		expect(buildToc([])).toEqual([]);
	});
});

describe('currentSection', () => {
	const headings = (tops: number[]) => tops.map((top, i) => ({ id: `s${i + 1}`, top }));

	it('is null while no heading has reached the line (reading the intro)', () => {
		expect(currentSection(headings([300, 900, 1500]), 112)).toBeNull();
	});

	it('is the last heading at or above the line', () => {
		expect(currentSection(headings([-400, 50, 700]), 112)).toBe('s2');
		expect(currentSection(headings([-900, -300, 112]), 112)).toBe('s3');
	});

	it('stays on a long section whose heading scrolled off the top', () => {
		expect(currentSection(headings([-2000, -1200, 800]), 112)).toBe('s2');
	});

	it('is null for no headings', () => {
		expect(currentSection([], 112)).toBeNull();
	});
});

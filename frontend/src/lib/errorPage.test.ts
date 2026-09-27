import { describe, expect, it } from 'vitest';
import { errorCopy } from './errorPage';

describe('errorCopy', () => {
	it('gives 404s the on-brand not-found copy', () => {
		const copy = errorCopy(404);
		expect(copy.notFound).toBe(true);
		expect(copy.heading).toBe('This path leads off into the bush…');
		expect(copy.eyebrow).toBe('Page not found');
		expect(copy.title).toBe('Page not found — Meryl Green Designs');
	});

	it('gives every other status the generic copy with the code in the eyebrow', () => {
		for (const status of [500, 503, 400]) {
			const copy = errorCopy(status);
			expect(copy.notFound).toBe(false);
			expect(copy.heading).toBe('Something went wrong');
			expect(copy.eyebrow).toBe(`Error ${status}`);
			expect(copy.title).toBe('Something went wrong — Meryl Green Designs');
		}
	});

	it('drops a nonsensical status from the eyebrow', () => {
		expect(errorCopy(0).eyebrow).toBe('Error');
		expect(errorCopy(Number.NaN).eyebrow).toBe('Error');
	});
});

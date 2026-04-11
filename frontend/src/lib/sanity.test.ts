import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/static/public', () => ({
	PUBLIC_SANITY_PROJECT_ID: 'testproj',
	PUBLIC_SANITY_DATASET: 'production'
}));

const { formatPrice, imageUrl } = await import('./sanity');

describe('formatPrice', () => {
	it('returns "Price on enquiry" for null', () => {
		expect(formatPrice(null)).toBe('Price on enquiry');
	});

	it('formats a positive number with the en-ZA locale and a leading R', () => {
		const result = formatPrice(1500);
		expect(result).toBe(`R ${(1500).toLocaleString('en-ZA')}`);
		expect(result.startsWith('R ')).toBe(true);
		expect(result).toContain('500');
	});

	it('formats zero as "R 0" rather than "Price on enquiry"', () => {
		expect(formatPrice(0)).toBe('R 0');
	});
});

describe('imageUrl', () => {
	const source = {
		_type: 'image' as const,
		asset: { _ref: 'image-abc123def456-800x600-jpg', _type: 'reference' as const }
	};

	it('returns a cdn.sanity.io URL for a valid source', () => {
		const url = imageUrl(source);
		expect(url).not.toBeNull();
		expect(url).toMatch(/^https:\/\/cdn\.sanity\.io\//);
		expect(url).toContain('testproj');
		expect(url).toContain('production');
	});

	it('includes w=640 when a width is provided', () => {
		const url = imageUrl(source, 640);
		expect(url).toContain('w=640');
	});
});

import { describe, expect, it, vi } from 'vitest';

// Separate test file because vi.mock is hoisted at module level — we can't
// change the mocked value of $env/static/public partway through sanity.test.ts.
// This file covers the defensive branch in imageUrl() that returns null when
// PUBLIC_SANITY_PROJECT_ID has not been configured at build time.
vi.mock('$env/static/public', () => ({
	PUBLIC_SANITY_PROJECT_ID: '',
	PUBLIC_SANITY_DATASET: 'production'
}));

vi.mock('$app/paths', () => ({ base: '' }));

const { imageUrl } = await import('./sanity');

describe('imageUrl without PUBLIC_SANITY_PROJECT_ID', () => {
	it('returns null rather than building a broken URL', () => {
		const source = {
			_type: 'image' as const,
			asset: { _ref: 'image-abc123def456-800x600-jpg', _type: 'reference' as const }
		};
		expect(imageUrl(source)).toBeNull();
	});
});

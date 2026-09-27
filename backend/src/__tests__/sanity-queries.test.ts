import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every GROQ string the product getters send so we can assert the
// projection shape without a real Sanity project.
const fetchMock = vi.fn();
vi.mock('@sanity/client', () => ({
	createClient: () => ({ fetch: fetchMock })
}));

import { getProductBySlug, getProducts, getProductsByIds, PRODUCT_PROJECTION } from '../sanity.js';

const CATEGORY_DEFAULT = '"category": coalesce(category, "screen")';

beforeEach(() => {
	delete process.env.CONTENT_BACKEND;
	fetchMock.mockReset();
	fetchMock.mockResolvedValue([]);
});

describe('product GROQ projections', () => {
	it("default a missing category to 'screen'", () => {
		expect(PRODUCT_PROJECTION).toContain(CATEGORY_DEFAULT);
	});

	it.each([
		['getProducts', () => getProducts()],
		['getProductBySlug', () => getProductBySlug('wild-amaryllis')],
		['getProductsByIds', () => getProductsByIds(['p1'])]
	])('%s sends the shared projection', async (_name, call) => {
		await call();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const query = fetchMock.mock.calls[0]?.[0] as string;
		expect(query).toContain(CATEGORY_DEFAULT);
		expect(query).toContain('"slug": slug.current');
		expect(query).toContain('available == true');
	});
});

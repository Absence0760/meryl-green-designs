import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SanityProduct, SanityGalleryPhoto, SanityTestimonial } from '../sanity.js';

vi.mock('../sanity.js', () => ({
	createOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	getProducts: vi.fn(),
	getProductBySlug: vi.fn(),
	getGalleryPhotos: vi.fn(),
	getTestimonials: vi.fn(),
	getProductsByIds: vi.fn(),
	updateOrderPayment: vi.fn()
}));
vi.mock('../email.js', async () => {
	const actual = await vi.importActual<typeof import('../email.js')>('../email.js');
	return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});

import { createApp } from '../app.js';
import * as sanity from '../sanity.js';

const testProduct: SanityProduct = {
	_id: 'prod-1',
	name: 'Test Screen',
	slug: 'test-screen',
	blurb: 'A screen',
	description: 'A longer description',
	priceZar: 1500,
	dimensions: null,
	available: true,
	order: 10,
	photos: []
};

const testPhoto: SanityGalleryPhoto = {
	_id: 'gal-1',
	image: { alt: 'a tree', asset: { _ref: 'image-abc-1000x1000-jpg' } },
	caption: 'At dawn',
	visible: true,
	order: 10
};

const testTestimonial: SanityTestimonial = {
	_id: 'test-1',
	quote: 'The screen arrived beautifully packaged and looks stunning.',
	author: 'Jane M.',
	location: 'Cape Town',
	visible: true,
	order: 10
};

describe('GET /products', () => {
	beforeEach(() => vi.mocked(sanity.getProducts).mockReset());

	it('returns the products list from Sanity', async () => {
		vi.mocked(sanity.getProducts).mockResolvedValueOnce([testProduct]);
		const app = createApp();
		const res = await app.request('/products');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.products).toHaveLength(1);
		expect(data.products[0]).toMatchObject({ _id: 'prod-1', name: 'Test Screen' });
	});

	it('returns an empty list when Sanity returns nothing', async () => {
		vi.mocked(sanity.getProducts).mockResolvedValueOnce([]);
		const app = createApp();
		const res = await app.request('/products');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.products).toEqual([]);
	});

	it('returns 500 with an error message when Sanity throws', async () => {
		vi.mocked(sanity.getProducts).mockRejectedValueOnce(new Error('sanity offline'));
		const app = createApp();
		const res = await app.request('/products');
		expect(res.status).toBe(500);
		const data = (await res.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.products).toEqual([]);
	});
});

describe('GET /products/:slug', () => {
	beforeEach(() => vi.mocked(sanity.getProductBySlug).mockReset());

	it('returns a single product when the slug matches', async () => {
		vi.mocked(sanity.getProductBySlug).mockResolvedValueOnce(testProduct);
		const app = createApp();
		const res = await app.request('/products/test-screen');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.product).toMatchObject({ _id: 'prod-1', name: 'Test Screen' });
	});

	it('returns 404 when the slug does not match any product', async () => {
		vi.mocked(sanity.getProductBySlug).mockResolvedValueOnce(null);
		const app = createApp();
		const res = await app.request('/products/nope');
		expect(res.status).toBe(404);
		const data = (await res.json()) as any;
		expect(data.error).toBeDefined();
	});

	it('returns 500 when Sanity throws', async () => {
		vi.mocked(sanity.getProductBySlug).mockRejectedValueOnce(new Error('boom'));
		const app = createApp();
		const res = await app.request('/products/test-screen');
		expect(res.status).toBe(500);
	});
});

describe('GET /gallery', () => {
	beforeEach(() => vi.mocked(sanity.getGalleryPhotos).mockReset());

	it('returns the gallery photos list from Sanity', async () => {
		vi.mocked(sanity.getGalleryPhotos).mockResolvedValueOnce([testPhoto]);
		const app = createApp();
		const res = await app.request('/gallery');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.photos).toHaveLength(1);
		expect(data.photos[0]).toMatchObject({ _id: 'gal-1', caption: 'At dawn' });
	});

	it('returns an empty list when Sanity returns nothing', async () => {
		vi.mocked(sanity.getGalleryPhotos).mockResolvedValueOnce([]);
		const app = createApp();
		const res = await app.request('/gallery');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.photos).toEqual([]);
	});

	it('returns 500 with an error message when Sanity throws', async () => {
		vi.mocked(sanity.getGalleryPhotos).mockRejectedValueOnce(new Error('sanity offline'));
		const app = createApp();
		const res = await app.request('/gallery');
		expect(res.status).toBe(500);
		const data = (await res.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.photos).toEqual([]);
	});
});

describe('GET /testimonials', () => {
	beforeEach(() => vi.mocked(sanity.getTestimonials).mockReset());

	it('returns the testimonial list from Sanity', async () => {
		vi.mocked(sanity.getTestimonials).mockResolvedValueOnce([testTestimonial]);
		const app = createApp();
		const res = await app.request('/testimonials');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.testimonials).toHaveLength(1);
		expect(data.testimonials[0]).toMatchObject({ _id: 'test-1', author: 'Jane M.' });
	});

	it('returns an empty list when Sanity returns nothing', async () => {
		vi.mocked(sanity.getTestimonials).mockResolvedValueOnce([]);
		const app = createApp();
		const res = await app.request('/testimonials');
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.testimonials).toEqual([]);
	});

	it('returns 500 with an error message when Sanity throws', async () => {
		vi.mocked(sanity.getTestimonials).mockRejectedValueOnce(new Error('sanity offline'));
		const app = createApp();
		const res = await app.request('/testimonials');
		expect(res.status).toBe(500);
		const data = (await res.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.testimonials).toEqual([]);
	});
});

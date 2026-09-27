import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	getLocalGalleryPhotos,
	getLocalProductBySlug,
	getLocalProducts,
	getLocalProductsByIds,
	getLocalTestimonials,
	isLocalContent,
	readLocalImage,
	resolveContentDir
} from '../content-local.js';
import { getProducts } from '../sanity.js';
import { createApp } from '../app.js';

function product(overrides: Record<string, unknown>) {
	return {
		_id: 'p',
		name: 'P',
		slug: 'p',
		blurb: null,
		description: null,
		priceZar: null,
		dimensions: null,
		available: true,
		order: 0,
		photos: [],
		...overrides
	};
}

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'mgd-content-'));
	mkdirSync(join(dir, 'images'));
	writeFileSync(join(dir, 'images', 'lion.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
	writeFileSync(join(dir, 'secret.jpg'), 'outside images dir');
	writeFileSync(
		join(dir, 'content.json'),
		JSON.stringify({
			products: [
				product({ _id: 'b', name: 'Bravo', slug: 'bravo', order: 10 }),
				product({ _id: 'a', name: 'Alpha', slug: 'alpha', order: 10 }),
				product({ _id: 'z', name: 'Zulu', slug: 'zulu', order: 0, category: 'cushion-cover' }),
				product({ _id: 'h', name: 'Hidden', slug: 'hidden', available: false })
			],
			galleryPhotos: [
				{ _id: 'g2', image: { alt: null, asset: { _ref: 'local:lion.jpg' } }, caption: null, visible: true, order: 20 },
				{ _id: 'g1', image: { alt: null, asset: { _ref: 'local:lion.jpg' } }, caption: null, visible: true, order: 10 },
				{ _id: 'g3', image: { alt: null, asset: { _ref: 'local:lion.jpg' } }, caption: null, visible: false, order: 0 }
			],
			testimonials: [
				{ _id: 't1', quote: 'q', author: 'a', location: null, visible: false, order: 0 }
			]
		})
	);
	process.env.CONTENT_BACKEND = 'local';
	process.env.CONTENT_DEV_DIR = dir;
});

afterEach(() => {
	delete process.env.CONTENT_BACKEND;
	delete process.env.CONTENT_DEV_DIR;
	rmSync(dir, { recursive: true, force: true });
});

describe('isLocalContent', () => {
	it('is on only when CONTENT_BACKEND=local', () => {
		expect(isLocalContent()).toBe(true);
		process.env.CONTENT_BACKEND = 'LOCAL';
		expect(isLocalContent()).toBe(true);
		delete process.env.CONTENT_BACKEND;
		expect(isLocalContent()).toBe(false);
	});
});

describe('resolveContentDir', () => {
	it('refuses a directory outside the working dir and tmp dir', () => {
		process.env.CONTENT_DEV_DIR = '/etc';
		expect(() => resolveContentDir()).toThrow(/CONTENT_DEV_DIR/);
	});
});

describe('local content getters', () => {
	it('returns available products ordered by order, then name', async () => {
		const list = await getLocalProducts();
		expect(list.map((p) => p._id)).toEqual(['z', 'a', 'b']);
	});

	it("defaults a missing category to 'screen' and keeps an explicit one", async () => {
		const list = await getLocalProducts();
		expect(Object.fromEntries(list.map((p) => [p._id, p.category]))).toEqual({
			z: 'cushion-cover',
			a: 'screen',
			b: 'screen'
		});
		expect((await getLocalProductBySlug('bravo'))?.category).toBe('screen');
		expect((await getLocalProductsByIds(['z']))[0]?.category).toBe('cushion-cover');
	});

	it("treats a null category as 'screen'", async () => {
		writeFileSync(
			join(dir, 'content.json'),
			JSON.stringify({ products: [product({ _id: 'n', category: null })] })
		);
		expect((await getLocalProducts())[0]?.category).toBe('screen');
	});

	it('finds a product by slug but not a hidden one', async () => {
		expect((await getLocalProductBySlug('alpha'))?._id).toBe('a');
		expect(await getLocalProductBySlug('hidden')).toBeNull();
	});

	it('filters products by id, excluding unavailable ones', async () => {
		const list = await getLocalProductsByIds(['a', 'h', 'missing']);
		expect(list.map((p) => p._id)).toEqual(['a']);
	});

	it('returns visible gallery photos in display order', async () => {
		const photos = await getLocalGalleryPhotos();
		expect(photos.map((p) => p._id)).toEqual(['g1', 'g2']);
	});

	it('hides invisible testimonials and tolerates missing sections', async () => {
		expect(await getLocalTestimonials()).toEqual([]);
		writeFileSync(join(dir, 'content.json'), '{}');
		expect(await getLocalProducts()).toEqual([]);
	});

	it('is what sanity.ts getProducts returns in local mode (no Sanity config needed)', async () => {
		delete process.env.SANITY_PROJECT_ID;
		const list = await getProducts();
		expect(list).toHaveLength(3);
	});
});

describe('readLocalImage', () => {
	it('reads an image from the images folder with its content type', async () => {
		const img = await readLocalImage('lion.jpg');
		expect(img?.contentType).toBe('image/jpeg');
		expect(img?.body.length).toBe(3);
	});

	it.each(['../secret.jpg', '..%2Fsecret.jpg', '.hidden.jpg', 'notes.txt', 'missing.jpg'])(
		'returns null for %s',
		async (name) => {
			expect(await readLocalImage(name)).toBeNull();
		}
	);
});

describe('GET /dev-content/images/:name', () => {
	it('serves local images when CONTENT_BACKEND=local', async () => {
		const res = await createApp().request('/dev-content/images/lion.jpg');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
	});

	it('404s for an unknown image', async () => {
		const res = await createApp().request('/dev-content/images/nope.jpg');
		expect(res.status).toBe(404);
	});

	it('is not registered when the local backend is off', async () => {
		delete process.env.CONTENT_BACKEND;
		const res = await createApp().request('/dev-content/images/lion.jpg');
		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).not.toBe('image/jpeg');
	});
});

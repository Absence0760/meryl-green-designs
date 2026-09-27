import { describe, expect, it, vi } from 'vitest';
import type { Product } from './sanity';

vi.mock('$env/static/public', () => ({
	PUBLIC_API_URL: 'http://localhost:3001',
	PUBLIC_SANITY_PROJECT_ID: 'testproj',
	PUBLIC_SANITY_DATASET: 'production'
}));

const {
	buildBreadcrumbJsonLd,
	buildProductJsonLd,
	IN_STOCK,
	OUT_OF_STOCK,
	productStructuredData,
	productUrl
} = await import('./productJsonLd');

const SITE = 'https://merylgreendesigns.com';

function makeProduct(overrides: Partial<Product> = {}): Product {
	return {
		_id: 'p1',
		name: 'Two Trees',
		slug: 'two-trees',
		category: 'screen',
		blurb: 'Acacias at dusk.',
		description: 'A three-panel screen.',
		priceZar: 4500,
		dimensions: null,
		available: true,
		order: 0,
		photos: [{ _key: 'a', alt: null, asset: { _ref: 'image-abc123-800x1000-jpg' } }],
		...overrides
	};
}

describe('buildProductJsonLd', () => {
	it('describes the product with brand, sku, category and canonical url', () => {
		const data = buildProductJsonLd(makeProduct(), SITE);
		expect(data).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: 'Two Trees',
			description: 'A three-panel screen.',
			sku: 'two-trees',
			productID: 'two-trees',
			url: `${SITE}/shop/two-trees`,
			brand: { '@type': 'Brand', name: 'Meryl Green Designs' },
			category: 'Folding screen'
		});
	});

	it('uses absolute Sanity CDN image URLs and skips unfinished uploads', () => {
		const data = buildProductJsonLd(
			makeProduct({
				photos: [
					{ _key: 'a', alt: null, asset: { _ref: 'image-abc123-800x1000-jpg' } },
					{ _key: 'b', alt: null, asset: null as unknown as { _ref: string } }
				]
			}),
			SITE
		);
		const images = data.image as string[];
		expect(images).toHaveLength(1);
		expect(images[0]).toMatch(/^https:\/\/cdn\.sanity\.io\/images\/testproj\/production\//);
	});

	it('resolves local-content photos to absolute backend URLs', () => {
		const data = buildProductJsonLd(
			makeProduct({ photos: [{ _key: 'a', alt: null, asset: { _ref: 'local:two-trees.jpg' } }] }),
			SITE
		);
		expect(data.image).toEqual(['http://localhost:3001/dev-content/images/two-trees.jpg']);
	});

	it('omits image when there are no usable photos', () => {
		expect(buildProductJsonLd(makeProduct({ photos: [] }), SITE)).not.toHaveProperty('image');
	});

	it('adds a ZAR offer that is InStock when available', () => {
		const data = buildProductJsonLd(makeProduct(), SITE);
		expect(data.offers).toEqual({
			'@type': 'Offer',
			url: `${SITE}/shop/two-trees`,
			priceCurrency: 'ZAR',
			price: 4500,
			availability: IN_STOCK,
			itemCondition: 'https://schema.org/NewCondition',
			seller: { '@type': 'Organization', name: 'Meryl Green Designs' }
		});
	});

	it('marks an unavailable product OutOfStock', () => {
		const data = buildProductJsonLd(makeProduct({ available: false }), SITE);
		expect((data.offers as { availability: string }).availability).toBe(OUT_OF_STOCK);
	});

	it('omits offers when the price is on enquiry', () => {
		expect(buildProductJsonLd(makeProduct({ priceZar: null }), SITE)).not.toHaveProperty('offers');
	});

	it('keeps a zero price as an offer', () => {
		const data = buildProductJsonLd(makeProduct({ priceZar: 0 }), SITE);
		expect((data.offers as { price: number }).price).toBe(0);
	});

	it('labels cushion covers and falls back through blurb to a generated description', () => {
		const cushion = makeProduct({ category: 'cushion-cover', description: '  ' });
		expect(buildProductJsonLd(cushion, SITE)).toMatchObject({
			category: 'Cushion cover',
			description: 'Acacias at dusk.'
		});
		const bare = makeProduct({ description: null, blurb: null });
		expect(buildProductJsonLd(bare, SITE).description).toBe(
			'Two Trees — a handcrafted folding screen by Meryl Green Designs.'
		);
	});
});

describe('buildBreadcrumbJsonLd', () => {
	it('lists Shop then the product', () => {
		expect(buildBreadcrumbJsonLd(makeProduct(), `${SITE}/`)).toEqual({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Shop', item: `${SITE}/shop` },
				{ '@type': 'ListItem', position: 2, name: 'Two Trees', item: `${SITE}/shop/two-trees` }
			]
		});
	});
});

describe('productUrl', () => {
	it('strips a trailing slash and encodes the slug', () => {
		expect(productUrl(`${SITE}/`, 'a b')).toBe(`${SITE}/shop/a%20b`);
	});
});

describe('productStructuredData', () => {
	it('emits two ld+json scripts that parse back to Product and BreadcrumbList', () => {
		const html = productStructuredData(makeProduct(), SITE);
		const payloads = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
			(m) => JSON.parse(m[1] ?? '')
		);
		expect(payloads.map((p) => p['@type'])).toEqual(['Product', 'BreadcrumbList']);
	});

	it('cannot be broken out of by CMS text containing </script>', () => {
		const evil = '</script><script>alert(1)</script>';
		const html = productStructuredData(
			makeProduct({ name: evil, description: evil, slug: 'x' }),
			SITE
		);
		// Only the two closing tags we emit ourselves.
		expect(html.match(/<\/script>/gi)).toHaveLength(2);
		expect(html.match(/<script/gi)).toHaveLength(2);
		const first = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
		expect(JSON.parse(first?.[1] ?? '').name).toBe(evil);
	});
});

import { describe, it, expect } from 'vitest';
import type { Product } from './sanity';
import {
	CATEGORY_SECTIONS,
	groupProductsByCategory,
	isScreen,
	pickFeaturedProducts,
	productCategory
} from './productGroups';

function makeProduct(overrides: Partial<Product> = {}): Product {
	return {
		_id: 'p',
		name: 'P',
		slug: 'p',
		category: 'screen',
		blurb: null,
		description: null,
		priceZar: 1500,
		dimensions: null,
		available: true,
		order: 0,
		photos: [],
		...overrides
	};
}

const photo = { _key: 'k', alt: null, asset: { _ref: 'image-abc-800x1000-jpg' } };

describe('groupProductsByCategory', () => {
	it('puts folding screens before cushion covers', () => {
		const sections = groupProductsByCategory([
			makeProduct({ _id: 'c1', category: 'cushion-cover' }),
			makeProduct({ _id: 's1', category: 'screen' })
		]);
		expect(sections.map((s) => s.heading)).toEqual(['Folding screens', 'Cushion covers']);
		expect(sections.map((s) => s.category)).toEqual(['screen', 'cushion-cover']);
	});

	it('keeps the incoming order within each section', () => {
		const sections = groupProductsByCategory([
			makeProduct({ _id: 's2' }),
			makeProduct({ _id: 'c2', category: 'cushion-cover' }),
			makeProduct({ _id: 's1' }),
			makeProduct({ _id: 'c1', category: 'cushion-cover' })
		]);
		expect(sections[0]?.products.map((p) => p._id)).toEqual(['s2', 's1']);
		expect(sections[1]?.products.map((p) => p._id)).toEqual(['c2', 'c1']);
	});

	it('drops empty sections', () => {
		expect(groupProductsByCategory([makeProduct()]).map((s) => s.category)).toEqual(['screen']);
		expect(
			groupProductsByCategory([makeProduct({ category: 'cushion-cover' })]).map(
				(s) => s.category
			)
		).toEqual(['cushion-cover']);
		expect(groupProductsByCategory([])).toEqual([]);
	});

	it('files a missing or unknown category under screens', () => {
		const legacy = makeProduct({ _id: 'legacy' });
		delete (legacy as Partial<Product>).category;
		const odd = makeProduct({ _id: 'odd', category: 'lamp' as Product['category'] });
		const sections = groupProductsByCategory([legacy, odd]);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.products.map((p) => p._id)).toEqual(['legacy', 'odd']);
	});

	it('has a section for every category', () => {
		expect(CATEGORY_SECTIONS.map((s) => s.category)).toEqual(['screen', 'cushion-cover']);
	});
});

describe('productCategory / isScreen', () => {
	it('recognises both categories and defaults the rest to screen', () => {
		expect(productCategory(makeProduct({ category: 'cushion-cover' }))).toBe('cushion-cover');
		expect(isScreen(makeProduct({ category: 'cushion-cover' }))).toBe(false);
		expect(isScreen(makeProduct({ category: 'screen' }))).toBe(true);
		expect(isScreen({ category: undefined as unknown as Product['category'] })).toBe(true);
	});
});

describe('pickFeaturedProducts', () => {
	it('keeps only products with a photo, in order, up to the limit', () => {
		const list = [
			makeProduct({ _id: 'a', photos: [photo] }),
			makeProduct({ _id: 'no-photo' }),
			makeProduct({ _id: 'b', photos: [photo] }),
			makeProduct({ _id: 'c', photos: [photo] }),
			makeProduct({ _id: 'd', photos: [photo] }),
			makeProduct({ _id: 'e', photos: [photo] })
		];
		expect(pickFeaturedProducts(list).map((p) => p._id)).toEqual(['a', 'b', 'c', 'd']);
		expect(pickFeaturedProducts(list, 3).map((p) => p._id)).toEqual(['a', 'b', 'c']);
	});

	it('skips photos whose upload never finished (null asset)', () => {
		const broken = makeProduct({
			_id: 'broken',
			photos: [{ _key: 'k', alt: null, asset: null as unknown as { _ref: string } }]
		});
		expect(pickFeaturedProducts([broken])).toEqual([]);
	});

	it('returns nothing for an empty list or a non-positive limit', () => {
		expect(pickFeaturedProducts([])).toEqual([]);
		expect(pickFeaturedProducts([makeProduct({ photos: [photo] })], 0)).toEqual([]);
	});
});

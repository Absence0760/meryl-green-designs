import type { Product, ProductCategory } from './sanity';

// Pure product-list helpers shared by the shop and home pages. Kept out
// of the .svelte files so vitest can cover them (see frontend/CLAUDE.md
// § Testing gotchas).

export type CategorySection = {
	category: ProductCategory;
	heading: string;
	products: Product[];
};

// Display order of the shop sections. Adding a category means adding a
// row here (plus the Studio radio option and the backend type).
export const CATEGORY_SECTIONS: ReadonlyArray<{ category: ProductCategory; heading: string }> = [
	{ category: 'screen', heading: 'Folding screens' },
	{ category: 'cushion-cover', heading: 'Cushion covers' }
];

// The backend already coalesces a missing category to 'screen'; repeat
// the default here so a stale or malformed payload still lands in a
// section instead of disappearing from the shop.
export function productCategory(product: Pick<Product, 'category'>): ProductCategory {
	return CATEGORY_SECTIONS.some((s) => s.category === product.category)
		? product.category
		: 'screen';
}

export function isScreen(product: Pick<Product, 'category'>): boolean {
	return productCategory(product) === 'screen';
}

// Split products into the ordered category sections, dropping empty
// ones. Order within a section is the order the backend returned
// (display order, then name).
export function groupProductsByCategory(products: Product[]): CategorySection[] {
	return CATEGORY_SECTIONS.map(({ category, heading }) => ({
		category,
		heading,
		products: products.filter((p) => productCategory(p) === category)
	})).filter((section) => section.products.length > 0);
}

function hasPhoto(product: Product): boolean {
	return typeof product.photos?.[0]?.asset?._ref === 'string';
}

// Products for the home page "Featured pieces" strip: only ones with a
// photo (the strip is image-led), in backend order, capped at `limit`.
export function pickFeaturedProducts(products: Product[], limit = 4): Product[] {
	return products.filter(hasPhoto).slice(0, Math.max(0, limit));
}

// Products for the "You may also like" strip on a product page: other
// available products, same category first, then the rest to fill up to
// `limit`. Within each group, display `order` ascending; ties keep the
// incoming (backend) order, since Array.prototype.sort is stable.
export function pickRelatedProducts(
	products: Product[],
	current: Pick<Product, 'slug' | 'category'>,
	limit = 3
): Product[] {
	const max = Math.max(0, limit);
	if (max === 0) return [];
	const category = productCategory(current);
	const candidates = products
		.filter((p) => p.slug !== current.slug && p.available !== false)
		.sort((a, b) => orderKey(a) - orderKey(b));
	const same = candidates.filter((p) => productCategory(p) === category);
	const others = candidates.filter((p) => productCategory(p) !== category);
	return [...same, ...others].slice(0, max);
}

// A missing/garbled `order` sorts last rather than poisoning the sort
// with NaN comparisons.
function orderKey(product: Product): number {
	return Number.isFinite(product.order) ? product.order : Number.MAX_SAFE_INTEGER;
}

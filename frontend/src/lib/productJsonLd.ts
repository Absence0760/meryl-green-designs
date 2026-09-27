import { imageUrl, type Product, type ProductCategory } from './sanity';
import { isScreen, productCategory } from './productGroups';
import { jsonLdScript } from './jsonLd';

// schema.org structured data for /shop/[slug]: a Product (with an Offer
// when the price is known) and a Shop → product BreadcrumbList. Pure
// builders so vitest can cover them; the page renders the result of
// `productStructuredData` via {@html}, which jsonLdScript makes safe.

export const BRAND_NAME = 'Meryl Green Designs';

const SCHEMA = 'https://schema.org';

const CATEGORY_LABEL: Record<ProductCategory, string> = {
	screen: 'Folding screen',
	'cushion-cover': 'Cushion cover'
};

// Every product is made to order, but schema.org/MadeToOrder isn't in
// Google's supported availability values for merchant listings, so an
// orderable product is InStock (it can be bought now).
export const IN_STOCK = `${SCHEMA}/InStock`;
export const OUT_OF_STOCK = `${SCHEMA}/OutOfStock`;

export function productUrl(siteUrl: string, slug: string): string {
	return `${siteUrl.replace(/\/$/, '')}/shop/${encodeURIComponent(slug)}`;
}

function productDescription(product: Product): string {
	return (
		product.description?.trim() ||
		product.blurb?.trim() ||
		`${product.name} — ${isScreen(product) ? 'a handcrafted folding screen' : 'a cushion cover'} by ${BRAND_NAME}.`
	);
}

export function buildProductJsonLd(product: Product, siteUrl: string): Record<string, unknown> {
	const url = productUrl(siteUrl, product.slug);
	const images = (product.photos ?? [])
		.map((photo) => imageUrl(photo, 1200))
		.filter((src): src is string => typeof src === 'string' && src.length > 0);

	const data: Record<string, unknown> = {
		'@context': SCHEMA,
		'@type': 'Product',
		name: product.name,
		description: productDescription(product),
		sku: product.slug,
		productID: product.slug,
		url,
		brand: { '@type': 'Brand', name: BRAND_NAME },
		category: CATEGORY_LABEL[productCategory(product)]
	};
	if (images.length > 0) data.image = images;
	if (typeof product.priceZar === 'number' && Number.isFinite(product.priceZar)) {
		data.offers = {
			'@type': 'Offer',
			url,
			priceCurrency: 'ZAR',
			price: product.priceZar,
			availability: product.available === false ? OUT_OF_STOCK : IN_STOCK,
			itemCondition: `${SCHEMA}/NewCondition`,
			seller: { '@type': 'Organization', name: BRAND_NAME }
		};
	}
	return data;
}

export function buildBreadcrumbJsonLd(product: Product, siteUrl: string): Record<string, unknown> {
	const base = siteUrl.replace(/\/$/, '');
	return {
		'@context': SCHEMA,
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Shop', item: `${base}/shop` },
			{
				'@type': 'ListItem',
				position: 2,
				name: product.name,
				item: productUrl(base, product.slug)
			}
		]
	};
}

/** Both ld+json script elements for a product page, safe for {@html}. */
export function productStructuredData(product: Product, siteUrl: string): string {
	return (
		jsonLdScript(buildProductJsonLd(product, siteUrl)) +
		jsonLdScript(buildBreadcrumbJsonLd(product, siteUrl))
	);
}

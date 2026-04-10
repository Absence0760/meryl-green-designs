import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url';
import { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } from '$env/static/public';

export type Product = {
	_id: string;
	name: string;
	slug: string;
	blurb: string | null;
	description: string | null;
	priceZar: number | null;
	available: boolean;
	order: number;
	photos: Array<{
		_key: string;
		alt: string | null;
		asset: { _ref: string };
	}>;
};

// @sanity/image-url only needs projectId + dataset to build URLs. It doesn't
// need auth or network access — the URL it produces points at Sanity's public
// CDN for assets, which stays publicly readable even when the document
// dataset itself is private.
const builder = createImageUrlBuilder({
	projectId: PUBLIC_SANITY_PROJECT_ID,
	dataset: PUBLIC_SANITY_DATASET || 'production'
});

export function imageUrl(source: SanityImageSource): string | null {
	if (!PUBLIC_SANITY_PROJECT_ID) return null;
	return builder.image(source).auto('format').fit('max').url();
}

export function formatPrice(priceZar: number | null): string {
	if (priceZar == null) return 'Price on enquiry';
	return `R ${priceZar.toLocaleString('en-ZA')}`;
}

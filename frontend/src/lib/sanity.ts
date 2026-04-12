import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url';
import { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } from '$env/static/public';
import { base } from '$app/paths';

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

export type GalleryPhoto = {
	_id: string;
	image: {
		alt: string | null;
		asset: { _ref: string };
	};
	caption: string | null;
	visible: boolean;
	order: number;
};

// @sanity/image-url only needs projectId + dataset to build URLs. It doesn't
// need auth or network access — the URL it produces points at Sanity's public
// CDN for assets, which stays publicly readable even when the document
// dataset itself is private.
const builder = createImageUrlBuilder({
	projectId: PUBLIC_SANITY_PROJECT_ID,
	dataset: PUBLIC_SANITY_DATASET || 'production'
});

export function imageUrl(source: SanityImageSource, width?: number): string | null {
	// Demo-mode escape hatch: asset refs prefixed with `demo:` are served
	// directly from /static/demo/ instead of going through Sanity's CDN.
	// Used by the `demo` branch GitHub Pages preview build — see lib/demo.ts.
	if (typeof source === 'object' && source !== null && 'asset' in source) {
		const asset = (source as { asset?: { _ref?: string } }).asset;
		const ref = asset?._ref;
		if (typeof ref === 'string' && ref.startsWith('demo:')) {
			return `${base}/demo/${ref.slice('demo:'.length)}`;
		}
	}

	if (!PUBLIC_SANITY_PROJECT_ID) return null;
	let img = builder.image(source).auto('format').fit('max');
	if (width) img = img.width(width);
	return img.url();
}

export function formatPrice(priceZar: number | null): string {
	if (priceZar == null) return 'Price on enquiry';
	return `R ${priceZar.toLocaleString('en-ZA')}`;
}

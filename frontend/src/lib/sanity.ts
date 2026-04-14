import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url';
import { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } from '$env/static/public';

type SanityHotspot = { x: number; y: number; height: number; width: number };
type SanityCrop = { top: number; bottom: number; left: number; right: number };

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
		hotspot?: SanityHotspot;
		crop?: SanityCrop;
	}>;
};

export type GalleryPhoto = {
	_id: string;
	image: {
		alt: string | null;
		asset: { _ref: string };
		hotspot?: SanityHotspot;
		crop?: SanityCrop;
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
	if (!PUBLIC_SANITY_PROJECT_ID) return null;
	let img = builder.image(source).auto('format').fit('max');
	if (width) img = img.width(width);
	return img.url();
}

export function formatPrice(priceZar: number | null): string {
	if (priceZar == null) return 'Price on enquiry';
	return `R ${priceZar.toLocaleString('en-ZA')}`;
}

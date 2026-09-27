// Which gallery photo sits beside the poem on the home page. The first
// FEATURED_BAND_COUNT photos already fill the featured-photographs band
// just above, so the poem takes the next usable one rather than repeat
// a picture. Null means the page falls back to the hero's portrait crop.

import type { GalleryPhoto } from './sanity';

/** Photos shown in the home page's featured-photographs band. */
export const FEATURED_BAND_COUNT = 4;

export function pickPoemPhoto(
	photos: readonly GalleryPhoto[],
	skip: number = FEATURED_BAND_COUNT
): GalleryPhoto | null {
	return (
		photos
			.slice(skip)
			.find((p) => typeof p?.image?.asset?._ref === 'string' && p.image.asset._ref.length > 0) ??
		null
	);
}

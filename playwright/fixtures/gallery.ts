// Deterministic gallery photo fixtures. The shop spec asserts the
// gallery page renders these in order; the home page's featured-band
// asserts only the first 4 visible photos render.
//
// No image asset is uploaded — Sanity Studio requires an image but
// for the runtime read path the frontend just builds an asset URL
// from the _ref string. We omit the image field entirely; the
// frontend's empty-state already handles missing-image gallery rows
// gracefully (an empty band rather than a render error). If a future
// spec needs to assert image rendering, swap to a 1x1 PNG upload via
// the asset endpoint.

export type SeedGalleryPhoto = {
	_id: string;
	caption: string;
	visible: boolean;
	order: number;
};

export const seedGallery: SeedGalleryPhoto[] = [
	{ _id: 'e2e-gallery-1', caption: 'E2E gallery photo one', visible: true, order: 10 },
	{ _id: 'e2e-gallery-2', caption: 'E2E gallery photo two', visible: true, order: 20 },
	{
		_id: 'e2e-gallery-hidden',
		caption: 'Hidden — should not render',
		visible: false,
		order: 99,
	},
];

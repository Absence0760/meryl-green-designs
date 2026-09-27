// Home hero photograph. WebP at three widths (static/two_trees-<w>.webp)
// with the original JPG as the fallback for browsers without WebP. The
// JPG also stays the og:image in +layout.svelte (some link-preview
// scrapers still don't accept WebP).

export const HERO_WIDTHS = [800, 1280, 1920] as const;

// The hero is full-bleed with `object-fit: cover` and a 72vh min-height.
// On a landscape viewport the image renders at 100vw; on a portrait one
// cover scales it to the hero's height, so its rendered width is about
// 72vh × 1.54 (the photo's aspect ratio) ≈ 111vh.
export const HERO_SIZES = '(orientation: portrait) 111vh, 100vw';

export function heroFallbackSrc(base = ''): string {
	return `${base}/two_trees.JPG`;
}

export function heroSrc(width: (typeof HERO_WIDTHS)[number], base = ''): string {
	return `${base}/two_trees-${width}.webp`;
}

export function heroSrcset(base = ''): string {
	return HERO_WIDTHS.map((w) => `${heroSrc(w, base)} ${w}w`).join(', ');
}

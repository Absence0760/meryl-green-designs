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

// Phones. On a tall portrait screen `cover` shows only the middle ~45% of
// the landscape photo, yet the browser still has to fetch the 1920w file
// (246 KB) to fill the hero's height at 2-3x DPR. A centred 3:4 crop
// (static/two_trees-portrait-<w>.webp, 47-125 KB, cut from the JPG with
// `magick two_trees.JPG -gravity center -crop 936x1246+0+0` then
// `cwebp -q 78 -m 6` at each width) shows exactly the same pixels there.
//
// The hero is at least 72vh tall, so a 3:4 image covers it without any
// top/bottom crop whenever the hero is narrower than 0.75 x 72vh, i.e. the
// viewport aspect ratio is <= 0.54 (27/50) — every phone held upright.
// Wider viewports keep the landscape set above.
export const HERO_PORTRAIT_WIDTHS = [480, 720, 936] as const;
export const HERO_PORTRAIT_MEDIA = '(max-aspect-ratio: 27/50)';
// Media for the landscape preload, so exactly one of the two preloads
// matches any viewport (the same split the <picture> makes).
export const HERO_LANDSCAPE_MEDIA = 'not all and (max-aspect-ratio: 27/50)';
// Rendered width = hero height (72vh) x 0.75.
export const HERO_PORTRAIT_SIZES = '54vh';

export function heroPortraitSrc(width: (typeof HERO_PORTRAIT_WIDTHS)[number], base = ''): string {
	return `${base}/two_trees-portrait-${width}.webp`;
}

export function heroPortraitSrcset(base = ''): string {
	return HERO_PORTRAIT_WIDTHS.map((w) => `${heroPortraitSrc(w, base)} ${w}w`).join(', ');
}

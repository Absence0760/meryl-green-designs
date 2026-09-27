import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	HERO_LANDSCAPE_MEDIA,
	HERO_PORTRAIT_MEDIA,
	HERO_PORTRAIT_WIDTHS,
	HERO_WIDTHS,
	heroFallbackSrc,
	heroPortraitSrc,
	heroPortraitSrcset,
	heroSrc,
	heroSrcset
} from './heroImage';

const staticDir = fileURLToPath(new URL('../../static', import.meta.url));

describe('heroSrcset', () => {
	it('lists every WebP width with a w descriptor, smallest first', () => {
		expect(heroSrcset()).toBe(
			'/two_trees-800.webp 800w, /two_trees-1280.webp 1280w, /two_trees-1920.webp 1920w'
		);
	});

	it('prefixes the SvelteKit base path', () => {
		expect(heroSrcset('/preview')).toContain('/preview/two_trees-800.webp 800w');
		expect(heroFallbackSrc('/preview')).toBe('/preview/two_trees.JPG');
	});
});

describe('hero files', () => {
	it('exist in static/ for every referenced width and the JPG fallback', () => {
		for (const w of HERO_WIDTHS) {
			expect(existsSync(staticDir + heroSrc(w)), heroSrc(w)).toBe(true);
		}
		expect(existsSync(staticDir + heroFallbackSrc())).toBe(true);
	});

	it('exist in static/ for every portrait crop width', () => {
		for (const w of HERO_PORTRAIT_WIDTHS) {
			expect(existsSync(staticDir + heroPortraitSrc(w)), heroPortraitSrc(w)).toBe(true);
		}
	});
});

describe('heroPortraitSrcset', () => {
	it('lists every portrait crop width with a w descriptor, smallest first', () => {
		expect(heroPortraitSrcset()).toBe(
			'/two_trees-portrait-480.webp 480w, /two_trees-portrait-720.webp 720w, /two_trees-portrait-936.webp 936w'
		);
		expect(heroPortraitSrcset('/preview')).toContain('/preview/two_trees-portrait-480.webp 480w');
	});

	it('pairs the portrait media query with its exact negation for the preloads', () => {
		expect(HERO_LANDSCAPE_MEDIA).toBe(`not all and ${HERO_PORTRAIT_MEDIA}`);
	});
});

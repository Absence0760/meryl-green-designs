import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HERO_WIDTHS, heroFallbackSrc, heroSrc, heroSrcset } from './heroImage';

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
});

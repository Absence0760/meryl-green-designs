import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Guards the hand-drawn SVGs in static/graphics (skyline, divider, and the
// home page's story / poem illustrations): decorative, self-contained,
// and small enough to stay cheaper than the photos they stand in for.

const dir = fileURLToPath(new URL('../../static/graphics/', import.meta.url));
const svgs = readdirSync(dir).filter((f) => f.endsWith('.svg'));
const MAX_BYTES = 6 * 1024;

describe('static/graphics SVGs', () => {
	it('includes the home page story and poem illustrations', () => {
		expect(svgs).toEqual(expect.arrayContaining(['story-golden-hour.svg', 'poem-moonrise.svg']));
	});

	it.each(svgs)('%s is decorative, self-contained and small', (file) => {
		const svg = readFileSync(dir + file, 'utf8');
		expect(svg).toMatch(/^<svg [^>]*viewBox="/);
		expect(svg).toContain('aria-hidden="true"');
		// No scripts, event handlers or external references — only #fragment hrefs.
		expect(svg).not.toMatch(/<script|\son[a-z]+=/i);
		for (const m of svg.matchAll(/href="([^"]*)"/g)) expect(m[1]).toMatch(/^#/);
		expect(statSync(dir + file).size).toBeLessThanOrEqual(MAX_BYTES);
	});
});

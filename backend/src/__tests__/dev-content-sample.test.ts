import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Guards the committed sample content in backend/dev-content.sample/.
// The repo is public: the sample must stay small, clearly labelled as
// sample, and self-consistent so a fresh clone renders a working shop.

const SAMPLE_DIR = resolve(__dirname, '../../dev-content.sample');
const content = JSON.parse(readFileSync(join(SAMPLE_DIR, 'content.json'), 'utf8')) as {
	products: Array<{
		_id: string;
		name: string;
		category?: string;
		available: boolean;
		photos: Array<{ asset: { _ref: string } }>;
	}>;
	galleryPhotos: Array<{ image: { asset: { _ref: string } } }>;
	testimonials: Array<{ quote: string; author: string }>;
};
const images = readdirSync(join(SAMPLE_DIR, 'images'));

describe('committed dev-content.sample', () => {
	it('covers both product categories with available products', () => {
		const categories = new Set(content.products.filter((p) => p.available).map((p) => p.category));
		expect(categories).toEqual(new Set(['screen', 'cushion-cover']));
	});

	it('labels every product and testimonial as sample', () => {
		for (const p of content.products) expect(p.name).toMatch(/sample/i);
		for (const t of content.testimonials) expect(`${t.quote} ${t.author}`).toMatch(/sample/i);
	});

	it('only references images that exist, and every image is referenced', () => {
		const refs = [
			...content.products.flatMap((p) => p.photos.map((ph) => ph.asset._ref)),
			...content.galleryPhotos.map((g) => g.image.asset._ref)
		];
		for (const ref of refs) {
			expect(ref.startsWith('local:')).toBe(true);
			expect(images).toContain(ref.slice('local:'.length));
		}
		expect(new Set(refs.map((r) => r.slice('local:'.length)))).toEqual(new Set(images));
	});

	it('stays small (< 600 KB total)', () => {
		const total = images.reduce((sum, f) => sum + statSync(join(SAMPLE_DIR, 'images', f)).size, 0);
		expect(total).toBeLessThan(600 * 1024);
	});
});

import { describe, it, expect } from 'vitest';
import { FEATURED_BAND_COUNT, pickPoemPhoto } from './poemPhoto';
import type { GalleryPhoto } from './sanity';

function photo(id: string, ref = `image-${id}-800x1000-jpg`): GalleryPhoto {
	return {
		_id: id,
		image: { alt: `Photo ${id}`, asset: { _ref: ref } },
		caption: null,
		visible: true,
		order: 0
	};
}

const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(`g${i + 1}`));

describe('pickPoemPhoto', () => {
	it('skips the photos already in the featured band', () => {
		expect(FEATURED_BAND_COUNT).toBe(4);
		expect(pickPoemPhoto(photos(6))?._id).toBe('g5');
	});

	it('returns null when every photo is already in the band', () => {
		expect(pickPoemPhoto(photos(4))).toBeNull();
		expect(pickPoemPhoto(photos(2))).toBeNull();
		expect(pickPoemPhoto([])).toBeNull();
	});

	it('skips mid-upload photos with no asset ref', () => {
		const list = [...photos(4), photo('pending', ''), photo('good')];
		expect(pickPoemPhoto(list)?._id).toBe('good');
	});

	it('honours a custom skip count', () => {
		expect(pickPoemPhoto(photos(3), 0)?._id).toBe('g1');
	});
});

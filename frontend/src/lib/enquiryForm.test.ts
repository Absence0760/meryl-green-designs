import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	ENQUIRY_INTERESTS,
	INTEREST_OPTIONS,
	enquiryChoiceFields,
	fieldCopy,
	pickContactPhoto
} from './enquiryForm';
import type { Product } from './sanity';

function product(overrides: Partial<Product> = {}): Product {
	return {
		_id: 'p1',
		name: 'Sunbird screen',
		slug: 'sunbird-screen',
		category: 'screen',
		blurb: null,
		description: null,
		priceZar: null,
		dimensions: null,
		available: true,
		order: 0,
		photos: [{ _key: 'k1', alt: 'A sunbird screen', asset: { _ref: 'image-abc-800x600-jpg' } }],
		...overrides
	};
}

describe('interest options', () => {
	it('offers one option per allowed interest, in order', () => {
		expect(INTEREST_OPTIONS.map((o) => o.value)).toEqual([...ENQUIRY_INTERESTS]);
		expect(INTEREST_OPTIONS.map((o) => o.label)).toEqual([
			'Folding screen',
			'Cushion cover',
			'Something else'
		]);
	});

	it('matches the backend enum exactly', () => {
		const backend = readFileSync(
			fileURLToPath(new URL('../../../backend/src/email-templates.ts', import.meta.url)),
			'utf8'
		);
		const match = backend.match(/ENQUIRY_INTERESTS = \[([^\]]+)\]/);
		expect(match).not.toBeNull();
		const values = match![1]!.split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
		expect(values).toEqual([...ENQUIRY_INTERESTS]);
	});
});

describe('fieldCopy', () => {
	it('uses neutral placeholders before a choice is made', () => {
		const copy = fieldCopy('');
		expect(copy.showFinish).toBe(true);
		expect(copy.photoPlaceholder).not.toMatch(/screen|cushion/i);
		expect(copy.sizePlaceholder).not.toMatch(/panel|cm/i);
	});

	it('keeps the screen-specific examples for a folding screen', () => {
		const copy = fieldCopy('screen');
		expect(copy.photoPlaceholder).toBe('e.g. Sunbird screen — sand finish');
		expect(copy.sizePlaceholder).toBe('e.g. 1.5m × 1.8m, 3 panels');
		expect(copy.finishPlaceholder).toBe('e.g. Meranti, light wax');
		expect(copy.showFinish).toBe(true);
	});

	it('switches to cushion examples and hides the wood/finish field', () => {
		const copy = fieldCopy('cushion-cover');
		expect(copy.photoPlaceholder).toBe('e.g. Wild Amaryllis in bloom');
		expect(copy.sizePlaceholder).toBe('e.g. 60cm × 60cm');
		expect(copy.showFinish).toBe(false);
	});

	it('treats "something else" like no choice', () => {
		expect(fieldCopy('other')).toEqual(fieldCopy(''));
	});
});

describe('enquiryChoiceFields', () => {
	it('omits interest when nothing is chosen', () => {
		expect(enquiryChoiceFields('', 'Oak')).toEqual({ finish: 'Oak' });
	});

	it('sends the chosen interest and the finish when the field is shown', () => {
		expect(enquiryChoiceFields('screen', 'Oak')).toEqual({ interest: 'screen', finish: 'Oak' });
	});

	it('drops a finish typed before switching to cushion cover', () => {
		expect(enquiryChoiceFields('cushion-cover', 'Oak')).toEqual({
			interest: 'cushion-cover',
			finish: ''
		});
	});
});

describe('pickContactPhoto', () => {
	it('returns null for no products', () => {
		expect(pickContactPhoto([])).toBeNull();
	});

	it('returns the first product with a usable photo', () => {
		const first = product();
		const second = product({ _id: 'p2', name: 'Second' });
		const picked = pickContactPhoto([first, second]);
		expect(picked?.product._id).toBe('p1');
		expect(picked?.photo._key).toBe('k1');
	});

	it('skips products without photos or with mid-upload (asset-less) photos', () => {
		const noPhotos = product({ _id: 'a', photos: [] });
		const pending = product({
			_id: 'b',
			photos: [{ _key: 'x', alt: null, asset: null as unknown as { _ref: string } }]
		});
		const good = product({ _id: 'c' });
		expect(pickContactPhoto([noPhotos, pending, good])?.product._id).toBe('c');
	});

	it('uses a later photo on the same product when the first is unusable', () => {
		const p = product({
			photos: [
				{ _key: 'x', alt: null, asset: { _ref: '' } },
				{ _key: 'y', alt: 'Second photo', asset: { _ref: 'image-def-800x600-jpg' } }
			]
		});
		expect(pickContactPhoto([p])?.photo._key).toBe('y');
	});

	it('returns null when no product has a usable photo', () => {
		expect(pickContactPhoto([product({ photos: [] })])).toBeNull();
	});
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	ENQUIRY_INTERESTS,
	INTEREST_OPTIONS,
	enquiryChoiceFields,
	fieldCopy,
	pickContactPhoto,
	productEnquiryHref,
	productEnquiryPrefill
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

	it('prefers the asked-about product when it has a usable photo', () => {
		const first = product();
		const asked = product({ _id: 'p2', name: 'Asked' });
		expect(pickContactPhoto([first, asked], asked)?.product._id).toBe('p2');
	});

	it('falls back to the list when the preferred product has no usable photo', () => {
		const first = product();
		const asked = product({ _id: 'p2', photos: [] });
		expect(pickContactPhoto([first, asked], asked)?.product._id).toBe('p1');
	});
});

describe('productEnquiryHref', () => {
	it('links to /contact with the slug as ?product=', () => {
		expect(productEnquiryHref('sunbird-screen')).toBe('/contact?product=sunbird-screen');
	});

	it('encodes the slug', () => {
		expect(productEnquiryHref('a b&c')).toBe('/contact?product=a%20b%26c');
	});
});

describe('productEnquiryPrefill', () => {
	const screen = product();
	const cushion = product({
		_id: 'p2',
		name: 'Wild Amaryllis cushion cover',
		slug: 'wild-amaryllis',
		category: 'cushion-cover'
	});

	it('pre-fills a screen with its name and the screen interest', () => {
		const prefill = productEnquiryPrefill([screen, cushion], 'sunbird-screen');
		expect(prefill?.product._id).toBe('p1');
		expect(prefill?.interest).toBe('screen');
		expect(prefill?.photoReference).toBe('Sunbird screen');
	});

	it('pre-fills a cushion cover with the cushion-cover interest', () => {
		const prefill = productEnquiryPrefill([screen, cushion], 'wild-amaryllis');
		expect(prefill?.interest).toBe('cushion-cover');
		expect(prefill?.photoReference).toBe('Wild Amaryllis cushion cover');
	});

	it('always yields an interest the backend accepts', () => {
		for (const p of [screen, cushion]) {
			const prefill = productEnquiryPrefill([p], p.slug);
			expect(ENQUIRY_INTERESTS).toContain(prefill?.interest);
		}
	});

	it('returns null for an unknown or empty slug, or before products load', () => {
		expect(productEnquiryPrefill([screen], 'nope')).toBeNull();
		expect(productEnquiryPrefill([screen], '')).toBeNull();
		expect(productEnquiryPrefill([], 'sunbird-screen')).toBeNull();
	});
});

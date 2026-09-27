// Pure logic behind the /contact commission form: the "Interested in"
// options, the per-choice field copy, and which product photo the
// desktop image column shows. Kept out of the .svelte file so it's
// testable under vitest (see frontend/CLAUDE.md § Testing gotchas).

import type { Product } from './sanity';

// Must match ENQUIRY_INTERESTS in backend/src/email-templates.ts — the
// backend rejects anything else with a 400 (enquiryForm.test.ts checks).
export const ENQUIRY_INTERESTS = ['screen', 'cushion-cover', 'other'] as const;
export type EnquiryInterest = (typeof ENQUIRY_INTERESTS)[number];

export const INTEREST_OPTIONS: ReadonlyArray<{ value: EnquiryInterest; label: string }> = [
	{ value: 'screen', label: 'Folding screen' },
	{ value: 'cushion-cover', label: 'Cushion cover' },
	{ value: 'other', label: 'Something else' }
];

export type EnquiryFieldCopy = {
	photoPlaceholder: string;
	sizePlaceholder: string;
	/** Wood/finish only makes sense for screens (or an unspecified piece). */
	showFinish: boolean;
	finishPlaceholder: string;
	locationPlaceholder: string;
};

const NEUTRAL: EnquiryFieldCopy = {
	photoPlaceholder: 'e.g. a photo from the gallery or shop',
	sizePlaceholder: 'e.g. rough dimensions, if you know them',
	showFinish: true,
	finishPlaceholder: 'e.g. a wood or finish you like',
	locationPlaceholder: 'e.g. living room, patio, bedroom'
};

const COPY: Record<EnquiryInterest, EnquiryFieldCopy> = {
	screen: {
		photoPlaceholder: 'e.g. Sunbird screen — sand finish',
		sizePlaceholder: 'e.g. 1.5m × 1.8m, 3 panels',
		showFinish: true,
		finishPlaceholder: 'e.g. Meranti, light wax',
		locationPlaceholder: 'e.g. living room divider, garden screen'
	},
	'cushion-cover': {
		photoPlaceholder: 'e.g. Wild Amaryllis in bloom',
		sizePlaceholder: 'e.g. 60cm × 60cm',
		showFinish: false,
		finishPlaceholder: '',
		locationPlaceholder: 'e.g. lounge sofa, reading chair'
	},
	other: NEUTRAL
};

/** Placeholder copy for the optional fields, given the current choice ('' = none yet). */
export function fieldCopy(interest: EnquiryInterest | ''): EnquiryFieldCopy {
	return interest ? COPY[interest] : NEUTRAL;
}

/**
 * The `interest` + `finish` values to send. A hidden finish field is
 * dropped so a value typed before switching to "Cushion cover" doesn't
 * reach the owner email.
 */
export function enquiryChoiceFields(
	interest: EnquiryInterest | '',
	finish: string
): { interest?: EnquiryInterest; finish: string } {
	return {
		...(interest ? { interest } : {}),
		finish: fieldCopy(interest).showFinish ? finish : ''
	};
}

type ProductPhoto = Product['photos'][number];

/**
 * The first product (in the order the API returned them) with a usable
 * photo — one whose asset ref is set. Null when there's nothing to show,
 * so the page falls back to its static hero image.
 */
export function pickContactPhoto(
	products: readonly Product[]
): { product: Product; photo: ProductPhoto } | null {
	for (const product of products) {
		const photo = product.photos?.find(
			(p) => typeof p?.asset?._ref === 'string' && p.asset._ref.length > 0
		);
		if (photo) return { product, photo };
	}
	return null;
}

// Materials and lead-time copy shared by the shop page's section headers
// and the product detail page, so the two can't drift. Facts confirmed by
// Meryl on 2026-09-27. Every lead-time claim must match the Terms
// (src/routes/terms/+page.svelte).

export type Spec = { label: string; value: string };

// Both product types are made after payment and leave within 3 weeks.
export const LEAD_TIME = 'Made to order — typically 3 weeks from payment to dispatch';

// The lion and elephant screens use the lighter basket weave; the
// per-piece fabric is named in each product's description in Sanity.
export const SCREEN_MATERIALS: readonly Spec[] = [
	{ label: 'Frame', value: 'Meranti hardwood, finished with a traditional teak stain' },
	{
		label: 'Fabric',
		value:
			'100% cotton canvas, or on some designs a lighter, textured cotton basket weave — digitally printed with a protective colour-fast coating'
	}
];

export const CUSHION_MATERIALS: readonly Spec[] = [
	{ label: 'Fabric', value: 'Cotton' },
	{ label: 'Insert', value: 'Not included — cover only' }
];

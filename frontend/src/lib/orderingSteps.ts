// Copy for the home page "How ordering works" strip. Kept in a plain .ts
// file so vitest can pin it against the legal wording: every claim here
// must match the Terms (src/routes/terms/+page.svelte). Both product types
// are made to order (Meryl confirmed cushion covers on 2026-09-27), but the
// ECT Act cooling-off exemption is a legal call for the Terms alone — this
// strip must never mention cancellation rights.

export type OrderingStep = {
	title: string;
	body: string;
	link?: { href: string; label: string };
};

export const ORDERING_STEPS: readonly OrderingStep[] = [
	{
		title: 'Pay securely',
		body: 'Card, Apple Pay, SnapScan or Instant EFT through PayFast. Your card details never reach us.'
	},
	{
		title: 'Made for you',
		body: 'Every folding screen and cushion cover is made to order once your payment clears.'
	},
	{
		title: 'Dispatched within 3 weeks',
		body: 'Your piece typically leaves the studio within 3 weeks of payment.'
	},
	{
		title: 'Delivered to your door',
		body: 'By courier to addresses in South Africa. Follow each step on the',
		link: { href: '/track', label: 'order tracking page' }
	}
];

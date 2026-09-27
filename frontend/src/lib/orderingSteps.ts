// Copy for the home page "How ordering works" strip. Kept in a plain .ts
// file so vitest can pin it against the legal wording: every claim here
// must match the Terms (src/routes/terms/+page.svelte) — in particular,
// "made to order" is claimed for folding screens only until Meryl and
// counsel confirm cushion covers (see the TODO(Meryl/legal) there).

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
		body: 'Folding screens are made to order once your payment clears.'
	},
	{
		title: 'Dispatched within 3 weeks',
		body: 'Screens and cushion covers typically leave the studio within 3 weeks of payment.'
	},
	{
		title: 'Delivered to your door',
		body: 'By courier to addresses in South Africa. Follow each step on the',
		link: { href: '/track', label: 'order tracking page' }
	}
];

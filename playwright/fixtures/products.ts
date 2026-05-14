// Deterministic product fixtures seeded into the test-e2e Sanity
// dataset at the start of every run. Specs assert against these
// values (slug, price, name) so any drift here breaks the cart spec.
//
// Three products by design: one cheap, one mid-price, one unavailable.
// The unavailable one is filtered out by GET /products and lets the
// shop spec verify the available-only contract.

export type SeedProduct = {
	_id: string;
	name: string;
	slug: string;
	blurb: string;
	description: string;
	price: number;
	available: boolean;
	order: number;
};

export const seedProducts: SeedProduct[] = [
	{
		_id: 'e2e-product-screen-small',
		name: 'Test Screen Small',
		slug: 'test-screen-small',
		blurb: 'A compact panel for the cart spec.',
		description: 'Used by the e2e suite to exercise the cart + checkout flow.',
		price: 1200,
		available: true,
		order: 10,
	},
	{
		_id: 'e2e-product-screen-large',
		name: 'Test Screen Large',
		slug: 'test-screen-large',
		blurb: 'A larger panel used to exercise quantity > 1 in the cart.',
		description: 'Second available product so the cart spec can test multi-line totals.',
		price: 3400,
		available: true,
		order: 20,
	},
	{
		_id: 'e2e-product-screen-sold',
		name: 'Test Screen Sold Out',
		slug: 'test-screen-sold',
		blurb: 'Hidden from the public shop list.',
		description: 'Used to verify the available=true filter on GET /products.',
		price: 5600,
		available: false,
		order: 30,
	},
];

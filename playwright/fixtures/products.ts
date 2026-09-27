// Deterministic product fixtures seeded into the test-e2e Sanity
// dataset at the start of every run. Specs assert against these
// values (slug, price, name) so any drift here breaks the cart spec.
//
// Three screens by design: one cheap, one mid-price, one unavailable.
// The unavailable one is filtered out by GET /products and lets the
// shop spec verify the available-only contract. Plus one cushion cover,
// ordered last so it lands in its own shop section after the screens
// (the cart spec's `Add to order` .nth(0)/.nth(1) still hit the two
// available screens).
//
// The screens deliberately carry NO `category`: they stand in for
// Sanity documents created before the field existed, exercising the
// backend's `coalesce(category, "screen")` default.

export type SeedProduct = {
	_id: string;
	name: string;
	slug: string;
	category?: 'screen' | 'cushion-cover';
	blurb: string;
	description: string;
	// The Sanity schema field is `priceZar`, not `price` — keep the fixture
	// type aligned so backend reads (which look up `product.priceZar`)
	// succeed against seeded data.
	priceZar: number;
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
		priceZar: 1200,
		available: true,
		order: 10,
	},
	{
		_id: 'e2e-product-screen-large',
		name: 'Test Screen Large',
		slug: 'test-screen-large',
		blurb: 'A larger panel used to exercise quantity > 1 in the cart.',
		description: 'Second available product so the cart spec can test multi-line totals.',
		priceZar: 3400,
		available: true,
		order: 20,
	},
	{
		_id: 'e2e-product-screen-sold',
		name: 'Test Screen Sold Out',
		slug: 'test-screen-sold',
		blurb: 'Hidden from the public shop list.',
		description: 'Used to verify the available=true filter on GET /products.',
		priceZar: 5600,
		available: false,
		order: 30,
	},
	{
		_id: 'e2e-product-cushion',
		name: 'Test Cushion Cover',
		slug: 'test-cushion-cover',
		category: 'cushion-cover',
		blurb: 'A cushion cover for the shop category sections.',
		description: 'Used to verify cushion covers get their own section and no screen specs.',
		priceZar: 450,
		available: true,
		order: 40,
	},
];

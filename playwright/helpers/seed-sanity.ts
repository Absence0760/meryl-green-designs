import { createClient, type SanityClient } from '@sanity/client';
import { seedProducts } from '../fixtures/products.ts';
import { seedGallery } from '../fixtures/gallery.ts';
import { seedTestimonials } from '../fixtures/testimonials.ts';
import { assertNotProd } from './env-guard.ts';

// Wipe + reseed the test-e2e Sanity dataset at the start of every run.
//
// Why wipe rather than upsert: deterministic state. Each suite run
// starts with exactly the documents declared in fixtures/, no more,
// no less — so asserting "shop shows two products" never depends on
// what a previous run left behind.
//
// Safety: assertNotProd() runs again here as a second-layer check —
// even if global-setup somehow skipped it, this client never
// constructs against production.

const E2E_TYPES = ['product', 'galleryPhoto', 'testimonial', 'order'] as const;

let _client: SanityClient | null = null;

function client(): SanityClient {
	if (_client) return _client;
	assertNotProd();
	_client = createClient({
		projectId: required('SANITY_PROJECT_ID'),
		dataset: required('SANITY_DATASET'),
		token: required('SANITY_API_TOKEN'),
		apiVersion: '2025-01-01',
		useCdn: false,
	});
	return _client;
}

export async function wipeAndSeedSanity(): Promise<void> {
	const c = client();
	// Belt-and-braces: the GROQ query is constrained to the four types
	// the project uses; the env-guard already prevents this from
	// reaching production.
	await c.delete({ query: `*[_type in ${JSON.stringify(E2E_TYPES)}]` });

	for (const p of seedProducts) {
		await c.createOrReplace({
			_id: p._id,
			_type: 'product',
			name: p.name,
			slug: { _type: 'slug', current: p.slug },
			blurb: p.blurb,
			description: p.description,
			price: p.price,
			available: p.available,
			order: p.order,
			photos: [],
		});
	}

	for (const g of seedGallery) {
		await c.createOrReplace({
			_id: g._id,
			_type: 'galleryPhoto',
			caption: g.caption,
			visible: g.visible,
			order: g.order,
		});
	}

	for (const t of seedTestimonials) {
		await c.createOrReplace({
			_id: t._id,
			_type: 'testimonial',
			quote: t.quote,
			author: t.author,
			location: t.location,
			visible: t.visible,
			order: t.order,
		});
	}

	// Sanity is eventually consistent; the listen-and-wait pattern is
	// fiddly here. A short delay is enough at this size.
	await new Promise((r) => setTimeout(r, 1500));
}

export async function patchOrderStatus(orderRef: string, status: string): Promise<void> {
	const c = client();
	const order = await c.fetch<{ _id: string } | null>(
		`*[_type == "order" && orderRef == $ref][0]{_id}`,
		{ ref: orderRef },
	);
	if (!order) throw new Error(`patchOrderStatus: no Sanity order with ref=${orderRef}`);
	await c.patch(order._id).set({ status }).commit();
}

export async function getSanityOrder(orderRef: string): Promise<Record<string, unknown> | null> {
	const c = client();
	return c.fetch(`*[_type == "order" && orderRef == $ref][0]`, { ref: orderRef });
}

function required(key: string): string {
	const v = process.env[key];
	if (!v) throw new Error(`[seed-sanity] required env var ${key} is unset`);
	return v;
}

// Allow running the seeder standalone for debugging:  pnpm playwright seed
if (import.meta.url === `file://${process.argv[1]}`) {
	const { config } = await import('dotenv');
	const path = await import('node:path');
	const { fileURLToPath } = await import('node:url');
	const here = path.dirname(fileURLToPath(import.meta.url));
	config({ path: path.join(here, '..', '.env'), override: true });
	config({ path: path.join(here, '..', '.env.local'), override: true });
	await wipeAndSeedSanity();
	console.log('[seed-sanity] done');
}

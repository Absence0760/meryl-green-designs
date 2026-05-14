import { createClient, type SanityClient } from '@sanity/client';

export type OrderStatus =
	| 'pending_payment'
	| 'payment_received'
	| 'shipped'
	| 'delivered'
	| 'cancelled';

export type PaymentMethod = 'eft' | 'payfast';

// Phase 1: Sanity stores only the non-PII order skeleton. PII lives in
// DynamoDB and is joined back by orders-store.ts before reaching any
// caller — see docs/orders-pii-split-plan.md. The `Order` shape that
// callers actually work with is exported from orders-store.ts.
export type SanityOrder = {
	_id: string;
	_type: 'order';
	_createdAt: string;
	_updatedAt: string;
	orderRef: string;
	status: OrderStatus;
	paymentMethod: PaymentMethod;
	amountZar: number | null;
	paymentId: string | null;
};

export type NewSanityOrderInput = {
	orderRef: string;
	paymentMethod?: PaymentMethod;
	amountZar?: number;
};

export type SanityProduct = {
	_id: string;
	name: string;
	slug: string;
	blurb: string | null;
	description: string | null;
	priceZar: number | null;
	dimensions: string | null;
	available: boolean;
	order: number;
	photos: Array<{
		_key: string;
		alt: string | null;
		asset: { _ref: string };
		// Sanity stores per-placement crop/hotspot metadata on the image
		// object itself (not the underlying asset). Carrying these through
		// lets the frontend image-url builder apply the correct crop —
		// without them, two photos that share an asset but have different
		// crops render identically.
		hotspot?: { x: number; y: number; height: number; width: number };
		crop?: { top: number; bottom: number; left: number; right: number };
	}>;
};

export type SanityTestimonial = {
	_id: string;
	quote: string;
	author: string;
	location: string | null;
	visible: boolean;
	order: number;
};

export type SanityGalleryPhoto = {
	_id: string;
	image: {
		alt: string | null;
		asset: { _ref: string };
		hotspot?: { x: number; y: number; height: number; width: number };
		crop?: { top: number; bottom: number; left: number; right: number };
	};
	caption: string | null;
	visible: boolean;
	order: number;
};

const PRODUCTS_QUERY = `*[_type == "product" && available == true] | order(order asc, name asc) {
	_id,
	name,
	"slug": slug.current,
	blurb,
	description,
	priceZar,
	dimensions,
	available,
	order,
	photos[] {
		_key,
		alt,
		asset,
		hotspot,
		crop
	}
}`;

const GALLERY_QUERY = `*[_type == "galleryPhoto" && visible == true] | order(order asc, _createdAt desc) {
	_id,
	image { alt, asset, hotspot, crop },
	caption,
	visible,
	order
}`;

const TESTIMONIALS_QUERY = `*[_type == "testimonial" && visible == true] | order(order asc, _createdAt desc) {
	_id,
	quote,
	author,
	location,
	visible,
	order
}`;

let cachedClient: SanityClient | null = null;

function getClient(): SanityClient {
	if (cachedClient) return cachedClient;

	const projectId = process.env.SANITY_PROJECT_ID;
	const dataset = process.env.SANITY_DATASET ?? 'production';
	const token = process.env.SANITY_API_TOKEN;

	if (!projectId) {
		throw new Error('SANITY_PROJECT_ID is not configured.');
	}
	if (!token) {
		throw new Error('SANITY_API_TOKEN is not configured.');
	}

	cachedClient = createClient({
		projectId,
		dataset,
		apiVersion: '2024-10-01',
		// Sanity's Fastly-backed query CDN — sub-100ms for cache hits vs
		// 200–400ms at the origin API. Shop/gallery tolerate the few-second
		// staleness window, and the Sanity webhook still fires on publish
		// for anything that needs an immediate rebuild.
		//
		// The e2e suite sets SANITY_USE_CDN=false so write-then-read flows
		// (place an order, immediately look it up) don't race the CDN's
		// propagation window. Production leaves the flag unset.
		useCdn: process.env.SANITY_USE_CDN !== 'false',
		token,
		perspective: 'published'
	});
	return cachedClient;
}

export async function createOrder(
	input: NewSanityOrderInput,
	options?: { signal?: AbortSignal }
): Promise<SanityOrder> {
	const client = getClient();
	const created = await client.create(
		{
			_type: 'order',
			orderRef: input.orderRef,
			status: 'pending_payment',
			paymentMethod: input.paymentMethod ?? 'payfast',
			amountZar: input.amountZar ?? null
		},
		// Propagate the abort signal into Sanity's underlying fetch so a
		// timeout on the caller side actually closes the TCP socket
		// rather than abandoning a still-pending request inside the
		// Lambda container.
		options?.signal ? { signal: options.signal } : undefined
	);
	return created as unknown as SanityOrder;
}

export async function deleteOrder(orderId: string): Promise<void> {
	// Used as the compensating action when the DynamoDB PII write succeeds
	// but the Sanity create fails — orders-store.ts catches and reverses
	// the DynamoDB row; if Sanity itself errors AFTER inserting the doc
	// (very rare), this is the cleanup hook.
	const client = getClient();
	await client.delete(orderId);
}

export async function updateOrderPayment(
	orderRef: string,
	updates: { status: OrderStatus; paymentId?: string }
): Promise<SanityOrder> {
	const client = getClient();
	const query = `*[_type == "order" && orderRef == $ref][0]._id`;
	const docId = await client.fetch<string | null>(query, { ref: orderRef });
	if (!docId) {
		throw new Error(`Order ${orderRef} not found`);
	}
	const patched = await client
		.patch(docId)
		.set({
			status: updates.status,
			...(updates.paymentId ? { paymentId: updates.paymentId } : {})
		})
		.commit();
	return patched as unknown as SanityOrder;
}

export async function getProductsByIds(ids: string[]): Promise<SanityProduct[]> {
	const client = getClient();
	const query = `*[_type == "product" && _id in $ids && available == true] {
		_id,
		name,
		"slug": slug.current,
		blurb,
		description,
		priceZar,
		dimensions,
		available,
		order,
		photos[] {
			_key,
			alt,
			asset,
			hotspot,
			crop
		}
	}`;
	return client.fetch<SanityProduct[]>(query, { ids });
}

export async function getOrderByRef(orderRef: string): Promise<SanityOrder | null> {
	const client = getClient();
	const query = `*[_type == "order" && orderRef == $ref][0]`;
	const result = await client.fetch<SanityOrder | null>(query, { ref: orderRef });
	return result ?? null;
}

export async function getProducts(): Promise<SanityProduct[]> {
	const client = getClient();
	return client.fetch<SanityProduct[]>(PRODUCTS_QUERY);
}

export async function getProductBySlug(slug: string): Promise<SanityProduct | null> {
	const client = getClient();
	// Same projection as PRODUCTS_QUERY — a single product filtered by slug.
	// Limited to available products so unpublished/hidden items don't leak
	// through a direct URL.
	const query = `*[_type == "product" && slug.current == $slug && available == true][0] {
		_id,
		name,
		"slug": slug.current,
		blurb,
		description,
		priceZar,
		dimensions,
		available,
		order,
		photos[] {
			_key,
			alt,
			asset,
			hotspot,
			crop
		}
	}`;
	const result = await client.fetch<SanityProduct | null>(query, { slug });
	return result ?? null;
}

export async function getGalleryPhotos(): Promise<SanityGalleryPhoto[]> {
	const client = getClient();
	return client.fetch<SanityGalleryPhoto[]>(GALLERY_QUERY);
}

export async function getTestimonials(): Promise<SanityTestimonial[]> {
	const client = getClient();
	return client.fetch<SanityTestimonial[]>(TESTIMONIALS_QUERY);
}

// PII retention is now handled by DynamoDB's per-item TTL (365 days from
// createdAt, set in orders-store.ts:buildPiiItem). The Sanity-side
// findOrdersWithExpiredPii / clearOrderPii pair that lived here before
// Phase 1 cutover was removed alongside backend/src/pii-cleanup.ts —
// see docs/orders-pii-split-plan.md.

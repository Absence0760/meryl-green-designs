import { createClient, type SanityClient } from '@sanity/client';

export type OrderStatus =
	| 'pending_payment'
	| 'payment_received'
	| 'shipped'
	| 'delivered'
	| 'cancelled';

export type PaymentMethod = 'eft' | 'payfast';

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
	customerName: string;
	customerEmail: string;
	customerPhone: string | null;
	shippingAddress: string | null;
	items: string;
	customerNotes: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shippingCarrier: string | null;
};

export type NewOrderInput = {
	orderRef: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	shippingAddress: string;
	items: string;
	customerNotes: string;
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
		useCdn: true,
		token,
		perspective: 'published'
	});
	return cachedClient;
}

export async function createOrder(input: NewOrderInput): Promise<SanityOrder> {
	const client = getClient();
	const created = await client.create({
		_type: 'order',
		orderRef: input.orderRef,
		status: 'pending_payment',
		paymentMethod: input.paymentMethod ?? 'eft',
		amountZar: input.amountZar ?? null,
		customerName: input.customerName,
		customerEmail: input.customerEmail,
		customerPhone: input.customerPhone || null,
		shippingAddress: input.shippingAddress,
		items: input.items,
		customerNotes: input.customerNotes || null
	});
	return created as unknown as SanityOrder;
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

// ---------------------------------------------------------------------------
// PII retention — see backend/src/pii-cleanup.ts and docs/security.md
// ---------------------------------------------------------------------------

/** Subset returned by findOrdersWithExpiredPii — just enough for the cleanup. */
export type ExpiredOrder = {
	_id: string;
	orderRef: string;
	status: OrderStatus;
};

/**
 * Find orders in a terminal state (`delivered` or `cancelled`) whose
 * `_updatedAt` is older than `cutoffIso`. These are eligible for PII
 * scrubbing under the documented retention policy. Already-scrubbed
 * orders self-exclude — `clearOrderPii()` updates `_updatedAt`, so the
 * order won't match the next time the query runs.
 */
export async function findOrdersWithExpiredPii(cutoffIso: string): Promise<ExpiredOrder[]> {
	const client = getClient();
	const query = `*[_type == "order"
		&& status in ["delivered", "cancelled"]
		&& _updatedAt < $cutoff
		&& (defined(customerEmail) || defined(customerName) || defined(shippingAddress) || defined(customerPhone))
	] | order(_updatedAt asc) {
		_id,
		orderRef,
		status
	}`;
	return client.fetch<ExpiredOrder[]>(query, { cutoff: cutoffIso });
}

/**
 * Set the PII fields on a single order to null. `orderRef`, `status`,
 * `amountZar`, `paymentMethod`, `paymentId`, `_createdAt`, `items` are
 * preserved for accounting/audit purposes — none of those are PII.
 *
 * `items` contains the product summary (`"1 x Small Screen — R 450"`)
 * which has no customer-identifying content; safe to keep.
 */
export async function clearOrderPii(orderId: string): Promise<void> {
	const client = getClient();
	await client
		.patch(orderId)
		.set({
			customerName: null,
			customerEmail: null,
			customerPhone: null,
			shippingAddress: null,
			customerNotes: null,
			internalNotes: null
		})
		.commit();
}

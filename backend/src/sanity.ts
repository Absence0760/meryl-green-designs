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
		available,
		order,
		photos[] {
			_key,
			alt,
			asset
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

export async function getGalleryPhotos(): Promise<SanityGalleryPhoto[]> {
	const client = getClient();
	return client.fetch<SanityGalleryPhoto[]>(GALLERY_QUERY);
}

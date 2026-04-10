import { createClient, type SanityClient } from '@sanity/client';

export type OrderStatus =
	| 'pending_payment'
	| 'payment_received'
	| 'shipped'
	| 'delivered'
	| 'cancelled';

export type SanityOrder = {
	_id: string;
	_type: 'order';
	_createdAt: string;
	_updatedAt: string;
	orderRef: string;
	status: OrderStatus;
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
	}>;
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
		asset
	}
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
		useCdn: false,
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
		customerName: input.customerName,
		customerEmail: input.customerEmail,
		customerPhone: input.customerPhone || null,
		shippingAddress: input.shippingAddress,
		items: input.items,
		customerNotes: input.customerNotes || null
	});
	return created as unknown as SanityOrder;
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

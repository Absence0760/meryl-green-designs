import type { APIRequestContext } from '@playwright/test';
import { seedProducts } from '../fixtures/products.ts';

// Shared helper for specs that need an existing order to operate on
// (tracking, ITN simulation, status-webhook firing). Hits the real
// POST /orders endpoint so the order goes through the dual-write
// path — DynamoDB row + Sanity skeleton — exactly like a live customer.

export type PlacedOrder = {
	orderRef: string;
	amountZar: number;
	payfast: { action: string; fields: Record<string, string> };
};

export async function placeOrder(
	request: APIRequestContext,
	overrides: Partial<{
		name: string;
		email: string;
		phone: string;
		address: string;
		notes: string;
		productSlug: string;
		quantity: number;
	}> = {},
): Promise<PlacedOrder> {
	const product =
		seedProducts.find((p) => p.slug === (overrides.productSlug ?? 'test-screen-small')) ??
		seedProducts[0];

	const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? 3001}`;
	const siteUrl = process.env.SITE_URL ?? `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 7777}`;

	const res = await request.post(`${apiUrl}/orders`, {
		headers: {
			'content-type': 'application/json',
			origin: siteUrl,
		},
		data: {
			name: overrides.name ?? 'E2E Customer',
			email: overrides.email ?? 'customer@e2e.local',
			phone: overrides.phone ?? '0821234567',
			address: overrides.address ?? '1 Test Lane, Cape Town, 8001',
			notes: overrides.notes ?? '',
			website: '',
			paymentMethod: 'payfast',
			cart: [{ productId: product._id, quantity: overrides.quantity ?? 1 }],
		},
	});
	if (!res.ok()) {
		throw new Error(`[placeOrder] POST /orders failed: ${res.status()} ${await res.text()}`);
	}
	const body = (await res.json()) as PlacedOrder & { success: boolean };
	if (!body.success) throw new Error(`[placeOrder] response had success=false`);
	return body;
}

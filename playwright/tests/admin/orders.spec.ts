import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { getOrderPii } from '../../helpers/dynamo-orders.ts';

// HTTP-level coverage of the Studio's PII-panel routes
// (backend/src/routes/admin.ts). The Studio bundle calls these
// via fetch with a bearer token; the suite drives them directly
// to keep the dependency on Sanity Studio out of the test path.

const apiUrl = () => process.env.API_URL!;
const studioOrigin = () => `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 7777}`;

function authedHeaders() {
	return {
		authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
		'content-type': 'application/json',
		origin: studioOrigin(),
	};
}

test.describe('admin /admin/orders/:ref', () => {
	test('GET returns the full PII row when authed', async ({ request }) => {
		const order = await placeOrder(request, { email: 'admin-get@e2e.local' });

		const res = await request.get(`${apiUrl()}/admin/orders/${order.orderRef}`, {
			headers: authedHeaders(),
		});
		expect(res.status()).toBe(200);
		const pii = (await res.json()) as Record<string, unknown>;
		expect(pii.customerName).toBe('E2E Customer');
		expect(pii.customerEmail).toBe('admin-get@e2e.local');
		expect(pii.customerPhone).toBe('0821234567');
		expect(pii.shippingAddress).toBe('1 Test Lane, Cape Town, 8001');
	});

	test('GET returns 404 for an unknown ref', async ({ request }) => {
		const res = await request.get(`${apiUrl()}/admin/orders/MG-000000-XXXXXX`, {
			headers: authedHeaders(),
		});
		expect(res.status()).toBe(404);
	});

	test('GET returns 401 with no Authorization header', async ({ request }) => {
		const order = await placeOrder(request);
		const res = await request.get(`${apiUrl()}/admin/orders/${order.orderRef}`, {
			headers: { 'content-type': 'application/json', origin: studioOrigin() },
		});
		expect(res.status()).toBe(401);
	});

	test('GET returns 401 with the wrong bearer token', async ({ request }) => {
		const order = await placeOrder(request);
		const res = await request.get(`${apiUrl()}/admin/orders/${order.orderRef}`, {
			headers: {
				authorization: 'Bearer wrong-token-value',
				'content-type': 'application/json',
				origin: studioOrigin(),
			},
		});
		expect(res.status()).toBe(401);
	});
});

test.describe('admin PATCH /admin/orders/:ref/tracking', () => {
	test('writes tracking fields and surfaces them via GET', async ({ request }) => {
		const order = await placeOrder(request, { email: 'admin-track@e2e.local' });

		const patch = await request.patch(
			`${apiUrl()}/admin/orders/${order.orderRef}/tracking`,
			{
				headers: authedHeaders(),
				data: {
					trackingNumber: 'CG-1234567',
					trackingUrl: 'https://www.courierguy.co.za/track/CG-1234567',
					shippingCarrier: 'Courier Guy',
				},
			},
		);
		expect(patch.status()).toBe(200);

		const pii = await getOrderPii(order.orderRef);
		expect(pii!.trackingNumber).toBe('CG-1234567');
		expect(pii!.trackingUrl).toBe('https://www.courierguy.co.za/track/CG-1234567');
		expect(pii!.shippingCarrier).toBe('Courier Guy');
	});

	test('rejects a javascript: trackingUrl with 400 (XSS guard)', async ({ request }) => {
		const order = await placeOrder(request);

		const patch = await request.patch(
			`${apiUrl()}/admin/orders/${order.orderRef}/tracking`,
			{
				headers: authedHeaders(),
				data: { trackingUrl: 'javascript:alert(1)' },
			},
		);
		expect(patch.status()).toBe(400);
		const body = (await patch.json()) as { error: string };
		expect(body.error).toMatch(/http/i);

		const pii = await getOrderPii(order.orderRef);
		expect(pii!.trackingUrl).toBeNull();
	});

	test('empty string clears the field (null in storage)', async ({ request }) => {
		const order = await placeOrder(request);

		// Set a value first
		await request.patch(`${apiUrl()}/admin/orders/${order.orderRef}/tracking`, {
			headers: authedHeaders(),
			data: { trackingNumber: 'TEMP-1' },
		});
		// Now clear it
		await request.patch(`${apiUrl()}/admin/orders/${order.orderRef}/tracking`, {
			headers: authedHeaders(),
			data: { trackingNumber: '' },
		});

		const pii = await getOrderPii(order.orderRef);
		expect(pii!.trackingNumber).toBeNull();
	});

	test('returns 401 without a bearer token', async ({ request }) => {
		const order = await placeOrder(request);
		const res = await request.patch(
			`${apiUrl()}/admin/orders/${order.orderRef}/tracking`,
			{
				headers: { 'content-type': 'application/json', origin: studioOrigin() },
				data: { trackingNumber: 'X' },
			},
		);
		expect(res.status()).toBe(401);
	});
});

test.describe('admin PATCH /admin/orders/:ref/internal-notes', () => {
	test('writes internalNotes and surfaces them via GET', async ({ request }) => {
		const order = await placeOrder(request);

		const note = 'Customer prefers Tuesday delivery';
		const patch = await request.patch(
			`${apiUrl()}/admin/orders/${order.orderRef}/internal-notes`,
			{
				headers: authedHeaders(),
				data: { internalNotes: note },
			},
		);
		expect(patch.status()).toBe(200);

		const pii = await getOrderPii(order.orderRef);
		expect(pii!.internalNotes).toBe(note);
	});

	test('empty string clears the field (null in storage)', async ({ request }) => {
		const order = await placeOrder(request);

		await request.patch(`${apiUrl()}/admin/orders/${order.orderRef}/internal-notes`, {
			headers: authedHeaders(),
			data: { internalNotes: 'temp' },
		});
		await request.patch(`${apiUrl()}/admin/orders/${order.orderRef}/internal-notes`, {
			headers: authedHeaders(),
			data: { internalNotes: '' },
		});

		const pii = await getOrderPii(order.orderRef);
		expect(pii!.internalNotes).toBeNull();
	});

	test('returns 401 without a bearer token', async ({ request }) => {
		const order = await placeOrder(request);
		const res = await request.patch(
			`${apiUrl()}/admin/orders/${order.orderRef}/internal-notes`,
			{
				headers: { 'content-type': 'application/json', origin: studioOrigin() },
				data: { internalNotes: 'X' },
			},
		);
		expect(res.status()).toBe(401);
	});
});

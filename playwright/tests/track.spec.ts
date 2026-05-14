import { test, expect } from '@playwright/test';
import { placeOrder } from '../helpers/place-order.ts';

// /track is the customer's view of their order: lookup form, status
// progress indicator, tracking info when shipped. The backend joins
// DynamoDB (PII) + Sanity (status) and returns a sanitised subset.

test.describe('/track lookup', () => {
	test('correct ref + email shows the order; wrong email returns 404 (no enumeration)', async ({
		page,
		request,
	}) => {
		const order = await placeOrder(request, { email: 'tracker@e2e.local' });

		const apiUrl = process.env.API_URL!;

		// Right combo: 200 with sanitised body
		const ok = await request.get(
			`${apiUrl}/orders/${order.orderRef}?email=tracker@e2e.local`,
		);
		expect(ok.status()).toBe(200);
		const tracked = await ok.json();
		expect(tracked.ref).toBe(order.orderRef);
		expect(tracked.status).toBe('pending_payment');
		expect(tracked.customerName).toBe('E2E Customer');
		// Sanitiser strips these
		expect(tracked.customerPhone).toBeUndefined();
		expect(tracked.shippingAddress).toBeUndefined();
		expect(tracked.internalNotes).toBeUndefined();

		// Wrong email: 404, not 403 (no enumeration)
		const wrong = await request.get(
			`${apiUrl}/orders/${order.orderRef}?email=different@e2e.local`,
		);
		expect(wrong.status()).toBe(404);

		// Wrong ref: also 404
		const fakeRef = await request.get(`${apiUrl}/orders/MG-000000-XXXXXX?email=tracker@e2e.local`);
		expect(fakeRef.status()).toBe(404);

		// Deep-linked /track page renders the customer's order
		await page.goto(`/track?ref=${order.orderRef}&email=tracker@e2e.local`);
		await expect(page.getByText(order.orderRef)).toBeVisible();
		await expect(page.getByText(/pending payment/i)).toBeVisible();
	});
});

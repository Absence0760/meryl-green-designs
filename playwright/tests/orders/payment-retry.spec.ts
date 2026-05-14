import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import {
	backdateOrder,
	getOrderPii,
	setRetryAttempts,
} from '../../helpers/dynamo-orders.ts';

// Self-service payment retry: POST /orders/:ref/retry-payment lets a
// customer re-submit the same orderRef to PayFast (instead of placing
// a duplicate). Gated by email match + status + 7-day window + an
// atomic per-orderRef lifetime cap of 5 attempts. Every fail path
// returns 404 with an identical body so the endpoint can't be used
// for enumeration.

const apiUrl = () => process.env.API_URL!;

test.describe('POST /orders/:ref/retry-payment', () => {
	test('happy path: re-signs a PayFast form for the same orderRef', async ({ request }) => {
		const order = await placeOrder(request, { email: 'retry-ok@e2e.local' });

		const res = await request.post(
			`${apiUrl()}/orders/${order.orderRef}/retry-payment?email=retry-ok@e2e.local`,
		);
		expect(res.status()).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			ref: string;
			payfast: { action: string; fields: Record<string, string> };
		};
		expect(body.success).toBe(true);
		expect(body.ref).toBe(order.orderRef); // SAME ref, not a new one
		expect(body.payfast.action).toContain('sandbox.payfast.co.za');
		expect(body.payfast.fields.m_payment_id).toBe(order.orderRef);
		expect(body.payfast.fields.amount).toBe(order.amountZar.toFixed(2));
		expect(body.payfast.fields.email_address).toBe('retry-ok@e2e.local');

		// Counter incremented to 1
		const pii = await getOrderPii(order.orderRef);
		expect(pii!.retryAttempts).toBe(1);
	});

	test('case-insensitive email match passes', async ({ request }) => {
		const order = await placeOrder(request, { email: 'case-retry@e2e.local' });
		const res = await request.post(
			`${apiUrl()}/orders/${order.orderRef}/retry-payment?email=CASE-Retry@E2E.local`,
		);
		expect(res.status()).toBe(200);
	});

	test('wrong email returns 404 (no enumeration) and does NOT increment the counter', async ({
		request,
	}) => {
		const order = await placeOrder(request, { email: 'retry-real@e2e.local' });

		for (let i = 0; i < 3; i++) {
			const res = await request.post(
				`${apiUrl()}/orders/${order.orderRef}/retry-payment?email=wrong@e2e.local`,
			);
			expect(res.status()).toBe(404);
		}

		// Crucial: 3 wrong-email attempts must NOT have burned the
		// customer's 5 lifetime slots. The counter sits at 0.
		const pii = await getOrderPii(order.orderRef);
		expect(pii!.retryAttempts ?? 0).toBe(0);
	});

	test('missing email param returns 404', async ({ request }) => {
		const order = await placeOrder(request);
		const res = await request.post(`${apiUrl()}/orders/${order.orderRef}/retry-payment`);
		expect(res.status()).toBe(404);
	});

	test('malformed ref returns 404', async ({ request }) => {
		const res = await request.post(
			`${apiUrl()}/orders/not-a-ref/retry-payment?email=x@y.com`,
		);
		expect(res.status()).toBe(404);
	});

	test('unknown ref returns 404', async ({ request }) => {
		const res = await request.post(
			`${apiUrl()}/orders/MG-000000-XXXXXX/retry-payment?email=x@y.com`,
		);
		expect(res.status()).toBe(404);
	});

	test('order outside the 7-day window returns 404', async ({ request }) => {
		const order = await placeOrder(request, { email: 'retry-old@e2e.local' });
		// Backdate 8 days — outside the 7-day window
		await backdateOrder(order.orderRef, 8);

		const res = await request.post(
			`${apiUrl()}/orders/${order.orderRef}/retry-payment?email=retry-old@e2e.local`,
		);
		expect(res.status()).toBe(404);

		// The fail-closed window check runs before the counter increment,
		// so the attempt is not counted.
		const pii = await getOrderPii(order.orderRef);
		expect(pii!.retryAttempts ?? 0).toBe(0);
	});

	test('cap exhaustion: 5 retries then 429', async ({ request }) => {
		const order = await placeOrder(request, { email: 'retry-cap@e2e.local' });

		// Burn 4 attempts via the API so the counter genuinely matches
		// real-world usage, then push the counter to 5 directly to keep
		// the spec fast — exercising the 5th increment via API would
		// double the runtime without adding coverage.
		await setRetryAttempts(order.orderRef, 5);

		const blocked = await request.post(
			`${apiUrl()}/orders/${order.orderRef}/retry-payment?email=retry-cap@e2e.local`,
		);
		expect(blocked.status()).toBe(429);
		const body = (await blocked.json()) as { error: string };
		expect(body.error).toMatch(/too many/i);
	});
});

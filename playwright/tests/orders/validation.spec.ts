import { test, expect } from '@playwright/test';
import { seedProducts } from '../../fixtures/products.ts';
import { listCapturedEmails } from '../../helpers/read-email.ts';
import { scanOrders } from '../../helpers/dynamo-orders.ts';

// Negative-path coverage for POST /orders. Each spec asserts the
// request is rejected before any DynamoDB / Sanity write — so a bad
// payload doesn't leave half-written orders or fire owner emails.

const apiUrl = () => process.env.API_URL!;
const siteUrl = () => process.env.SITE_URL!;

const goodProductId = seedProducts.find((p) => p.available)!._id;
const soldOutProductId = seedProducts.find((p) => !p.available)!._id;

const baseBody = {
	name: 'Validation Customer',
	email: 'validation@e2e.local',
	phone: '0821234567',
	address: '1 Test Lane, Cape Town, 8001',
	notes: '',
	website: '',
	paymentMethod: 'payfast',
	cart: [{ productId: goodProductId, quantity: 1 }],
};

function postOrder(
	request: import('@playwright/test').APIRequestContext,
	overrides: Record<string, unknown> = {},
) {
	return request.post(`${apiUrl()}/orders`, {
		headers: { 'content-type': 'application/json', origin: siteUrl() },
		data: { ...baseBody, ...overrides },
	});
}

test.describe('POST /orders validation', () => {
	// No `clearCapturedEmails` beforeEach. The earlier version of this
	// spec wiped the dir before each test and then asserted
	// `emails.toHaveLength(0)` afterwards — but that's brittle when
	// preceding specs in the run are still writing emails after the
	// wipe lands (intermittent file-write races on file-backend
	// captures). Instead: snapshot the captured-email count BEFORE the
	// validation request and assert it didn't grow by the time we
	// re-check. Catches a regression where validation accidentally lets
	// a bad payload through to sendEmail without false-failing on
	// unrelated emails from other specs.

	for (const [label, overrides, expectedError] of [
		['missing name', { name: '' }, /please enter your name/i],
		['missing email', { email: '' }, /please enter your email/i],
		['malformed email', { email: 'not-an-email' }, /valid email/i],
		['missing address', { address: '' }, /shipping address/i],
		['empty cart', { cart: [] }, /at least one product/i],
		['cart item with quantity 0', { cart: [{ productId: goodProductId, quantity: 0 }] }, /invalid cart item/i],
		['cart item with no productId', { cart: [{ quantity: 1 }] }, /invalid cart item/i],
	] as const) {
		test(`rejects ${label} with 400 and writes nothing`, async ({ request }) => {
			const ordersBefore = await scanOrders();
			const emailsBefore = await listCapturedEmails();

			const res = await postOrder(request, overrides);
			expect(res.status()).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(expectedError);

			// No order persisted
			const ordersAfter = await scanOrders();
			expect(ordersAfter.length).toBe(ordersBefore.length);

			// No owner-notification email fired by THIS request. Compare
			// the absolute count of captured emails; if validation let a
			// bad payload through to sendEmail, the count grows by one.
			// 200ms gives any in-flight write from this request time to
			// land before the post-check.
			await new Promise((r) => setTimeout(r, 200));
			const emailsAfter = await listCapturedEmails();
			expect(emailsAfter.length).toBe(emailsBefore.length);
		});
	}

	test('rejects an oversize name (> 120 chars) with 400', async ({ request }) => {
		const res = await postOrder(request, { name: 'x'.repeat(150) });
		expect(res.status()).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/too long/i);
	});

	test('rejects a sold-out product with 400', async ({ request }) => {
		const res = await postOrder(request, {
			cart: [{ productId: soldOutProductId, quantity: 1 }],
		});
		expect(res.status()).toBe(400);
		const body = (await res.json()) as { error: string };
		// Sold-out product is filtered before price lookup, so the message
		// is the not-available one rather than the no-price one.
		expect(body.error).toMatch(/not available/i);
	});

	test('rejects an unknown productId with 400', async ({ request }) => {
		const res = await postOrder(request, {
			cart: [{ productId: 'does-not-exist', quantity: 1 }],
		});
		expect(res.status()).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/not available/i);
	});

	test('honeypot: filled `website` returns SKIPPED without writing or emailing', async ({
		request,
	}) => {
		const ordersBefore = await scanOrders();
		const emailsBefore = await listCapturedEmails();

		const res = await postOrder(request, { website: 'https://example.com/bot' });
		expect(res.status()).toBe(200);
		const body = (await res.json()) as { success: boolean; ref: string };
		expect(body.success).toBe(true);
		expect(body.ref).toBe('SKIPPED');

		const ordersAfter = await scanOrders();
		expect(ordersAfter.length).toBe(ordersBefore.length);

		// Same delta-not-zero check as the validation cases above —
		// robust to leftover captures from other specs.
		await new Promise((r) => setTimeout(r, 200));
		const emailsAfter = await listCapturedEmails();
		expect(emailsAfter.length).toBe(emailsBefore.length);
	});

	test('rejects malformed JSON with 400', async ({ request }) => {
		const res = await request.post(`${apiUrl()}/orders`, {
			headers: { 'content-type': 'application/json', origin: siteUrl() },
			data: 'not-json',
		});
		expect(res.status()).toBe(400);
	});
});

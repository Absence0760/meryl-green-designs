import { test, expect } from '@playwright/test';
import { placeOrder } from '../helpers/place-order.ts';
import { patchOrderStatus, getSanityOrder } from '../helpers/seed-sanity.ts';
import { buildSanityWebhookHeader } from '../helpers/sign-sanity-webhook.ts';
import { clearCapturedEmails, waitForEmail } from '../helpers/read-email.ts';

// Sanity fires a webhook to /webhooks/sanity-order whenever an order
// document's status changes. The backend verifies the HMAC-SHA256
// signature over the raw body, joins DynamoDB to recover customer
// email (no PII in the webhook payload), and dispatches the matching
// status-keyed email.
//
// The test simulates the webhook directly rather than relying on
// Sanity's actual webhook service to fire — CI doesn't expose a
// reachable URL to Sanity, and signing the body ourselves exercises
// the same verifier code path.

const apiUrl = () => process.env.API_URL!;
const secret = () => process.env.SANITY_WEBHOOK_SECRET!;

test.describe('Sanity status webhook', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	test('shipped status fires the customer "shipped" email', async ({ request }) => {
		const order = await placeOrder(request, { email: 'shipping@e2e.local' });

		// Move the order through to shipped via Sanity (simulating Meryl
		// publishing in Studio) — then fire the webhook ourselves.
		await patchOrderStatus(order.orderRef, 'shipped');
		const doc = await getSanityOrder(order.orderRef);

		const rawBody = JSON.stringify(doc);
		const header = buildSanityWebhookHeader(rawBody, secret());

		const res = await request.post(`${apiUrl()}/webhooks/sanity-order`, {
			headers: {
				'content-type': 'application/json',
				'sanity-webhook-signature': header,
			},
			data: rawBody,
		});
		expect(res.status()).toBe(200);

		const emails = await waitForEmail(
			(e) => e.to === 'shipping@e2e.local' && /shipped|on the way/i.test(e.subject),
		);
		expect(emails.length).toBeGreaterThan(0);
	});

	test('invalid signature returns 401', async ({ request }) => {
		const order = await placeOrder(request);
		const doc = await getSanityOrder(order.orderRef);
		const rawBody = JSON.stringify(doc);
		const header = buildSanityWebhookHeader(rawBody, 'WRONG_SECRET');

		const res = await request.post(`${apiUrl()}/webhooks/sanity-order`, {
			headers: {
				'content-type': 'application/json',
				'sanity-webhook-signature': header,
			},
			data: rawBody,
		});
		expect(res.status()).toBe(401);
	});

	test('missing signature header returns 401', async ({ request }) => {
		const order = await placeOrder(request);
		const doc = await getSanityOrder(order.orderRef);

		const res = await request.post(`${apiUrl()}/webhooks/sanity-order`, {
			headers: { 'content-type': 'application/json' },
			data: JSON.stringify(doc),
		});
		expect(res.status()).toBe(401);
	});
});

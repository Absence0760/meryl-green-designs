import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { patchOrderStatus, getSanityOrder } from '../../helpers/seed-sanity.ts';
import { buildSanityWebhookHeader } from '../../helpers/sign-sanity-webhook.ts';
import { clearCapturedEmails, waitForEmail } from '../../helpers/read-email.ts';

// Drive every customer-facing status email through the production
// path: patch the Sanity order's status (simulating Meryl publishing
// in Studio), then POST a signed webhook payload to
// /webhooks/sanity-order. The handler should:
//   1. Verify the HMAC over the raw body.
//   2. Join DynamoDB by orderRef to recover customer email.
//   3. Look up the status-keyed template + send via Resend (file
//      backend in tests).
//
// Covers all five OrderStatus values: pending_payment,
// payment_received, shipped, delivered, cancelled. (The
// pending_payment template is normally never sent because POST
// /orders redirects straight to PayFast; it fires only if Meryl
// manually resets a status to pending_payment — exercised here.)

const apiUrl = () => process.env.API_URL!;
const secret = () => process.env.SANITY_WEBHOOK_SECRET!;

async function fireStatusWebhook(
	request: import('@playwright/test').APIRequestContext,
	orderRef: string,
) {
	const doc = await getSanityOrder(orderRef);
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
}

const STATUS_CASES = [
	{
		status: 'pending_payment',
		email: 'pending-template@e2e.local',
		subjectRe: /order received/i,
		bodyRe: /awaiting payment|received your order|payment/i,
	},
	{
		status: 'payment_received',
		email: 'received-template@e2e.local',
		subjectRe: /order confirmed/i,
		bodyRe: /payment|received|confirmed/i,
	},
	{
		status: 'delivered',
		email: 'delivered-template@e2e.local',
		subjectRe: /delivered/i,
		bodyRe: /delivered|love|enjoy|arrived/i,
	},
	{
		status: 'cancelled',
		email: 'cancelled-template@e2e.local',
		subjectRe: /cancelled/i,
		bodyRe: /cancelled|sorry|refund|wasn.t able/i,
	},
] as const;

test.describe('customer status emails via Sanity webhook', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	for (const c of STATUS_CASES) {
		test(`${c.status} → customer email`, async ({ request }) => {
			const order = await placeOrder(request, { email: c.email });
			await patchOrderStatus(order.orderRef, c.status);

			await fireStatusWebhook(request, order.orderRef);

			const emails = await waitForEmail(
				(e) => e.to === c.email && c.subjectRe.test(e.subject),
			);
			expect(emails.length).toBeGreaterThan(0);
			expect(emails[0].bodyHtml).toMatch(c.bodyRe);
			// Every customer status email mentions the order ref.
			expect(emails[0].bodyHtml).toContain(order.orderRef);
		});
	}

	test('shipped → customer email includes tracking info from DynamoDB', async ({ request }) => {
		const order = await placeOrder(request, { email: 'shipped-tracking@e2e.local' });

		// Write tracking info via the admin route (simulates Meryl using
		// the Studio panel before publishing the status change).
		const trackPatch = await request.patch(
			`${apiUrl()}/admin/orders/${order.orderRef}/tracking`,
			{
				headers: {
					authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
					'content-type': 'application/json',
					origin: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 7777}`,
				},
				data: {
					trackingNumber: 'CG-9876543',
					trackingUrl: 'https://www.courierguy.co.za/track/CG-9876543',
					shippingCarrier: 'Courier Guy',
				},
			},
		);
		expect(trackPatch.status()).toBe(200);

		await patchOrderStatus(order.orderRef, 'shipped');
		await fireStatusWebhook(request, order.orderRef);

		const emails = await waitForEmail(
			(e) => e.to === 'shipped-tracking@e2e.local' && /shipped|on the way/i.test(e.subject),
		);
		expect(emails.length).toBeGreaterThan(0);
		const body = emails[0].bodyHtml;
		expect(body).toContain('Courier Guy');
		expect(body).toContain('CG-9876543');
		expect(body).toContain('https://www.courierguy.co.za/track/CG-9876543');
	});

	test('every status email escapes customer-name HTML', async ({ request }) => {
		// Place an order with an HTML-bearing customer name. The Sanity
		// skeleton doesn't store the name, but the join from DynamoDB
		// inside the webhook handler pulls it back, and the template
		// runs it through escapeHtml() before interpolation.
		const order = await placeOrder(request, {
			name: 'Mal <script>alert(1)</script> Customer',
			email: 'xss-test@e2e.local',
		});
		await patchOrderStatus(order.orderRef, 'payment_received');
		await fireStatusWebhook(request, order.orderRef);

		const emails = await waitForEmail(
			(e) => e.to === 'xss-test@e2e.local' && /order confirmed/i.test(e.subject),
		);
		expect(emails[0].bodyHtml).not.toContain('<script>');
		expect(emails[0].bodyHtml).toContain('&lt;script&gt;');
	});
});

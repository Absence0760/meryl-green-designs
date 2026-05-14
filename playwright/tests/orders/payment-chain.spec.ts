import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { buildSignedItn } from '../../helpers/sign-payfast-itn.ts';
import { buildSanityWebhookHeader } from '../../helpers/sign-sanity-webhook.ts';
import { getSanityOrder } from '../../helpers/seed-sanity.ts';
import { clearCapturedEmails, waitForEmail } from '../../helpers/read-email.ts';

// End-to-end chain spec: place an order → PayFast posts a valid
// COMPLETE ITN → the ITN handler flips the Sanity status to
// payment_received and writes paymentId → Sanity's webhook fires on
// that status change → the customer receives the "order confirmed"
// email.
//
// The previous payment-itn + sanity-webhook specs cover each leg in
// isolation. This spec drives the full chain so a regression in any
// of the wiring (ITN handler reads paymentId, Sanity update returns,
// webhook handler joins DynamoDB, template lookup, email send) gets
// caught as one failure rather than three green specs and a broken
// production flow.
//
// We still drive the Sanity webhook ourselves rather than relying on
// the dashboard-configured webhook: the test Sanity project has no
// webhook configured (the suite is offline-friendly), so we replicate
// what Sanity would have POSTed by signing the just-updated document
// with the test SANITY_WEBHOOK_SECRET.

const apiUrl = () => process.env.API_URL!;
const passphrase = () => process.env.PAYFAST_PASSPHRASE!;
const webhookSecret = () => process.env.SANITY_WEBHOOK_SECRET!;

test.describe('PayFast COMPLETE → status → customer email (full chain)', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	test('successful payment flips status, writes paymentId, and sends order-confirmed email', async ({
		request,
	}) => {
		const order = await placeOrder(request, { email: 'chain@e2e.local' });

		// Leg 1 — PayFast posts the ITN
		const pfPaymentId = 'pf_chain_test_001';
		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: pfPaymentId,
				payment_status: 'COMPLETE',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);
		const itnRes = await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		expect(itnRes.status()).toBe(200);

		// Leg 2 — Sanity reflects the new status + paymentId
		await expect
			.poll(async () => (await getSanityOrder(order.orderRef))?.status, { timeout: 5000 })
			.toBe('payment_received');
		const sanityDoc = await getSanityOrder(order.orderRef);
		expect(sanityDoc!.paymentMethod).toBe('payfast');
		expect(sanityDoc!.paymentId).toBe(pfPaymentId);

		// Leg 3 — Sanity webhook fires on the status change
		const rawBody = JSON.stringify(sanityDoc);
		const header = buildSanityWebhookHeader(rawBody, webhookSecret());
		const webhookRes = await request.post(`${apiUrl()}/webhooks/sanity-order`, {
			headers: {
				'content-type': 'application/json',
				'sanity-webhook-signature': header,
			},
			data: rawBody,
		});
		expect(webhookRes.status()).toBe(200);

		// Leg 4 — Customer receives the "order confirmed" email
		const emails = await waitForEmail(
			(e) => e.to === 'chain@e2e.local' && /order confirmed/i.test(e.subject),
		);
		expect(emails.length).toBeGreaterThan(0);
		expect(emails[0].bodyHtml).toContain(order.orderRef);
		expect(emails[0].bodyHtml).toMatch(/payment/i);
	});

	test('duplicate ITN for the same orderRef is idempotent (no second email)', async ({
		request,
	}) => {
		const order = await placeOrder(request, { email: 'chain-dup@e2e.local' });

		const buildBody = (pfId: string) =>
			buildSignedItn(
				{
					m_payment_id: order.orderRef,
					pf_payment_id: pfId,
					payment_status: 'COMPLETE',
					amount_gross: order.amountZar.toFixed(2),
				},
				passphrase(),
			);

		// First ITN
		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: buildBody('pf_dup_1'),
		});
		await expect
			.poll(async () => (await getSanityOrder(order.orderRef))?.status, { timeout: 5000 })
			.toBe('payment_received');

		// Fire the Sanity webhook the way the change would normally
		// propagate, get the customer email captured.
		const sanityDocAfterFirst = await getSanityOrder(order.orderRef);
		const rawBody = JSON.stringify(sanityDocAfterFirst);
		const header = buildSanityWebhookHeader(rawBody, webhookSecret());
		await request.post(`${apiUrl()}/webhooks/sanity-order`, {
			headers: { 'content-type': 'application/json', 'sanity-webhook-signature': header },
			data: rawBody,
		});
		await waitForEmail(
			(e) => e.to === 'chain-dup@e2e.local' && /order confirmed/i.test(e.subject),
		);

		// PayFast retries are common. Second ITN for the SAME order
		// hits the idempotency guard (status is no longer
		// pending_payment) and silently no-ops. No second status
		// change → no second webhook → no duplicate email.
		const dup = await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: buildBody('pf_dup_2'),
		});
		expect(dup.status()).toBe(200);

		// Status still payment_received, paymentId still the first id
		const doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('payment_received');
		expect(doc!.paymentId).toBe('pf_dup_1');
	});
});

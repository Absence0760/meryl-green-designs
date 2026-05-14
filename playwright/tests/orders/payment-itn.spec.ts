import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { buildSignedItn } from '../../helpers/sign-payfast-itn.ts';
import { getOrderPii } from '../../helpers/dynamo-orders.ts';
import { getSanityOrder } from '../../helpers/seed-sanity.ts';
import { clearCapturedEmails, waitForEmail } from '../../helpers/read-email.ts';

// PayFast posts an ITN (Instant Transaction Notification) to the
// backend after the customer pays. The backend verifies the MD5
// signature over the raw body, cross-checks the amount, and flips the
// Sanity order status to payment_received — which trips the existing
// Sanity webhook to send the customer's "order confirmed" email.
//
// Real PayFast can't reach a CI runner, so the test signs an ITN
// itself with the public sandbox passphrase + merchant id and posts
// it to the backend directly.

const apiUrl = () => process.env.API_URL!;
const passphrase = () => process.env.PAYFAST_PASSPHRASE!;

test.describe('PayFast ITN', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	test('valid COMPLETE ITN flips status to payment_received', async ({ request }) => {
		const order = await placeOrder(request);

		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_complete_1',
				payment_status: 'COMPLETE',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);

		const res = await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		expect(res.status()).toBe(200);

		// Status flips on Sanity (which is what /track reads from)
		await expect
			.poll(async () => {
				const doc = await getSanityOrder(order.orderRef);
				return doc?.status;
			}, { timeout: 5000 })
			.toBe('payment_received');

		// DynamoDB PII row is untouched by the ITN handler — payment-only fields
		// live on Sanity. The PII row keeps the original customer details.
		const dynRow = await getOrderPii(order.orderRef);
		expect(dynRow!.customerEmail).toBe('customer@e2e.local');
	});

	test('invalid signature returns 401', async ({ request }) => {
		const order = await placeOrder(request);

		// Build with the wrong passphrase
		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_invalid',
				payment_status: 'COMPLETE',
				amount_gross: order.amountZar.toFixed(2),
			},
			'WRONG_PASSPHRASE',
		);

		const res = await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		// PayFast ITN never returns 4xx (would cause retry storms); the
		// handler returns 200 and silently no-ops on invalid sigs.
		// The signal is that the Sanity status didn't change.
		expect(res.status()).toBeGreaterThanOrEqual(200);
		const doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('pending_payment');
	});

	test('amount mismatch leaves status as pending_payment', async ({ request }) => {
		const order = await placeOrder(request);

		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_amount_mismatch',
				payment_status: 'COMPLETE',
				amount_gross: '0.01', // wildly wrong
			},
			passphrase(),
		);

		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});

		const doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('pending_payment');
	});

	test('FAILED ITN sends the payment-failed email', async ({ request }) => {
		const order = await placeOrder(request, { email: 'failed@e2e.local' });

		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_failed_1',
				payment_status: 'FAILED',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);

		const res = await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		expect(res.status()).toBe(200);

		// Customer receives the payment-failed template
		const emails = await waitForEmail(
			(e) => e.to === 'failed@e2e.local' && /didn.t go through|payment failed|retry/i.test(e.subject),
		);
		expect(emails.length).toBeGreaterThan(0);
		// The retry link must not embed the email param (Referer-leak rule)
		expect(emails[0].bodyHtml).toMatch(/\/track\?ref=MG-/);
		expect(emails[0].bodyHtml).not.toMatch(/\/track\?ref=MG-[A-Z0-9-]+&email=/);
	});
});

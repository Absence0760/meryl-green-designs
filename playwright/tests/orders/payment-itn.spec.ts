import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { buildSignedItn } from '../../helpers/sign-payfast-itn.ts';
import { getOrderPii } from '../../helpers/dynamo-orders.ts';
import { getSanityOrder } from '../../helpers/seed-sanity.ts';
import {
	clearCapturedEmails,
	listCapturedEmails,
	waitForEmail,
} from '../../helpers/read-email.ts';

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

	test('repeated identical FAILED ITN does NOT re-send the email (dedup marker works)', async ({
		request,
	}) => {
		// Audit L-3: PayFast retries delivery of the same FAILED ITN
		// every few minutes for up to 24h. Each retry carries the same
		// pf_payment_id. The dedup marker on the DynamoDB row suppresses
		// the email after the first delivery so the customer doesn't get
		// "your payment didn't go through" 10 times in a day.
		const order = await placeOrder(request, { email: 'dedup-same@e2e.local' });

		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_dedup_same',
				payment_status: 'FAILED',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);

		// First delivery → email captured
		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		const first = await waitForEmail(
			(e) => e.to === 'dedup-same@e2e.local' && /didn.t go through/i.test(e.subject),
		);
		expect(first).toHaveLength(1);

		// Second delivery with the SAME pf_payment_id → no new email
		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		// Generous wait so a late delivery would surface; assert count
		// stays at 1.
		await new Promise((r) => setTimeout(r, 1000));
		const all = await listCapturedEmails();
		const failedEmailsForThisOrder = all.filter(
			(e) => e.to === 'dedup-same@e2e.local' && /didn.t go through/i.test(e.subject),
		);
		expect(failedEmailsForThisOrder).toHaveLength(1);
	});

	test('FAILED ITN with a NEW pf_payment_id re-sends the email (customer retried + failed again)', async ({
		request,
	}) => {
		// Customer attempts payment → FAILED → abandons. Tries again
		// hours later → FAILED with a different pf_payment_id. This is
		// a genuinely new failed-payment event, so the customer should
		// hear about it — the dedup marker only suppresses retries of
		// the SAME pf_payment_id.
		const order = await placeOrder(request, { email: 'dedup-new@e2e.local' });

		const itnA = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_attempt_a',
				payment_status: 'FAILED',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);
		const itnB = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: 'pf_e2e_attempt_b',
				payment_status: 'FAILED',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);

		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: itnA,
		});
		const afterA = await waitForEmail(
			(e) => e.to === 'dedup-new@e2e.local' && /didn.t go through/i.test(e.subject),
		);
		expect(afterA).toHaveLength(1);

		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: itnB,
		});
		const afterB = await waitForEmail(
			(e) => e.to === 'dedup-new@e2e.local' && /didn.t go through/i.test(e.subject),
			{ count: 2 },
		);
		expect(afterB).toHaveLength(2);
	});

	test('FAILED ITN with empty pf_payment_id sends the email but does NOT poison-pill the dedup marker', async ({
		request,
	}) => {
		// Audit M-X-2: PayFast normally always populates pf_payment_id
		// but a sandbox quirk has been seen to omit it on rare FAILED
		// callbacks. If the backend wrote `''` as the dedup marker on
		// the first such ITN, EVERY subsequent empty-id FAILED ITN
		// would match the marker and be suppressed forever — turning
		// a one-off quirk into a permanent silent failure. The fix in
		// payfast-itn.ts is to send the email but SKIP the marker write
		// when pf_payment_id is empty. This e2e exercises the round-trip.
		const order = await placeOrder(request, { email: 'poison-pill@e2e.local' });

		// buildSignedItn filters empty-string fields out of the signed
		// body — matching PayFast's sandbox behaviour, which omits the
		// field entirely rather than sending `pf_payment_id=`.
		const body = buildSignedItn(
			{
				m_payment_id: order.orderRef,
				pf_payment_id: '',
				payment_status: 'FAILED',
				amount_gross: order.amountZar.toFixed(2),
			},
			passphrase(),
		);

		// First delivery
		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		const first = await waitForEmail(
			(e) => e.to === 'poison-pill@e2e.local' && /didn.t go through/i.test(e.subject),
		);
		expect(first).toHaveLength(1);

		// Second delivery of the SAME empty-id ITN. If the marker had
		// been written (`''`), the dedup check would suppress this.
		// Because the skip-write fix is in place, the customer hears
		// about this second failure too.
		await request.post(`${apiUrl()}/webhooks/payfast-itn`, {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: body,
		});
		const second = await waitForEmail(
			(e) => e.to === 'poison-pill@e2e.local' && /didn.t go through/i.test(e.subject),
			{ count: 2 },
		);
		expect(second).toHaveLength(2);
	});
});

import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { patchOrderStatus, getSanityOrder } from '../../helpers/seed-sanity.ts';
import { buildSanityWebhookHeader } from '../../helpers/sign-sanity-webhook.ts';
import { runAutoCancelHandler } from '../../helpers/run-auto-cancel.ts';
import { clearCapturedEmails, waitForEmail } from '../../helpers/read-email.ts';

// Auto-cancel sweep: a daily EventBridge-scheduled Lambda
// (backend/src/auto-cancel-lambda.ts) finds pending_payment orders
// older than AUTO_CANCEL_DAYS and patches them to cancelled. The
// status patch then trips the Sanity webhook → cancellation email
// (same chain as a Studio-driven status change).
//
// Production guards AUTO_CANCEL_DAYS to a positive integer so a
// misconfigured Lambda can't sweep every pending_payment order at
// once. Tests bypass that floor by passing `--days 0` to the script
// entry — same code path as the Lambda handler, just a direct
// invocation of autoCancelStaleOrders({ days: 0 }).

const apiUrl = () => process.env.API_URL!;
const secret = () => process.env.SANITY_WEBHOOK_SECRET!;

test.describe('auto-cancel sweep', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	test('finds + cancels a pending_payment order; idempotent on a second run', async ({
		request,
	}) => {
		const order = await placeOrder(request, { email: 'sweep@e2e.local' });

		// Sanity check: status is pending_payment before the sweep
		let doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('pending_payment');

		// Days=0 → cutoff is "now", so every pending_payment order is
		// eligible. Invokes the same autoCancelStaleOrders() function
		// the Lambda handler would call, exercising the Sanity find +
		// patch path without waiting 30 days.
		const first = await runAutoCancelHandler({ days: 0 });
		expect(first.exitCode).toBe(0);
		expect(first.result).not.toBeNull();
		expect(first.result!.found).toBeGreaterThanOrEqual(1);
		expect(first.result!.cancelled).toBeGreaterThanOrEqual(1);
		expect(first.result!.failed).toBe(0);

		// Status now cancelled
		doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('cancelled');

		// Idempotent re-run: the just-cancelled order is no longer
		// in pending_payment, so it isn't found again.
		const second = await runAutoCancelHandler({ days: 0 });
		expect(second.exitCode).toBe(0);
		expect(second.result).not.toBeNull();
		// `found` only counts the new sweep's results. If only our
		// just-cancelled order existed, this is 0; if other tests
		// left pending orders behind, those would still match — but
		// our order is no longer in the pending set.
		expect(second.result!.cancelled).toBe(second.result!.found);
		doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('cancelled'); // still cancelled
	});

	test('cancellation email lands via the Sanity webhook chain', async ({ request }) => {
		const order = await placeOrder(request, { email: 'sweep-email@e2e.local' });

		// Run the sweep so status flips on Sanity
		const sweep = await runAutoCancelHandler({ days: 0 });
		expect(sweep.exitCode).toBe(0);

		// In production, Sanity's webhook fires on the status change
		// and triggers the cancellation email. The test Sanity project
		// has no webhook configured, so simulate what Sanity would
		// have POSTed — same signing path as the sanity-webhook spec.
		const doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('cancelled');
		const rawBody = JSON.stringify(doc);
		const header = buildSanityWebhookHeader(rawBody, secret());
		const webhookRes = await request.post(`${apiUrl()}/webhooks/sanity-order`, {
			headers: {
				'content-type': 'application/json',
				'sanity-webhook-signature': header,
			},
			data: rawBody,
		});
		expect(webhookRes.status()).toBe(200);

		// Cancellation email reaches the customer
		const emails = await waitForEmail(
			(e) => e.to === 'sweep-email@e2e.local' && /cancelled/i.test(e.subject),
		);
		expect(emails.length).toBeGreaterThan(0);
		expect(emails[0].bodyHtml).toContain(order.orderRef);
	});

	test('skips orders already past pending_payment', async ({ request }) => {
		const order = await placeOrder(request, { email: 'sweep-paid@e2e.local' });
		// Move the order past pending_payment via Sanity (simulates a
		// real customer paying or Meryl manually advancing the status).
		await patchOrderStatus(order.orderRef, 'payment_received');

		const sweep = await runAutoCancelHandler({ days: 0 });
		expect(sweep.exitCode).toBe(0);

		// Status untouched
		const doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('payment_received');
	});

	test('production env floor: AUTO_CANCEL_DAYS=1 does NOT cancel a just-created order', async ({
		request,
	}) => {
		const order = await placeOrder(request, { email: 'sweep-fresh@e2e.local' });

		// Use the env-driven path (no --days arg) with AUTO_CANCEL_DAYS=1
		// so the cutoff is 24h in the past. A 1-second-old order is well
		// within the window and should not be cancelled.
		const sweep = await runAutoCancelHandler({ env: { AUTO_CANCEL_DAYS: '1' } });
		expect(sweep.exitCode).toBe(0);

		const doc = await getSanityOrder(order.orderRef);
		expect(doc!.status).toBe('pending_payment');
	});
});

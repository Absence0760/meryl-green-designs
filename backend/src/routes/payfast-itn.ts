import { Hono } from 'hono';
import { validateItn } from '../payfast.js';
import { getOrderByRef, updateOrderStatus } from '../orders-store.js';
import { createRateLimiter } from '../rate-limit.js';
import { sendEmail } from '../email.js';
import { paymentFailedTemplate } from '../email-templates.js';

/**
 * POST /payfast-itn
 *
 * PayFast sends an ITN (Instant Transaction Notification) as a
 * URL-encoded POST after a customer completes (or fails) payment.
 * We validate the signature, confirm the amount matches, and update
 * the order status in Sanity.
 *
 * PayFast retries if it doesn't get a 200 back, so we return 200
 * even on validation failures — logging warnings instead.
 */
export function payfastItnRouter() {
	const payfastItn = new Hono();

	// PayFast retries failed ITNs aggressively (every few minutes for hours),
	// so the cap needs to absorb legitimate retry traffic from PayFast's own
	// IPs while still capping spoofed-source flooding.
	const itnLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

	payfastItn.post('/', itnLimiter, async (c) => {
		const passphrase = process.env.PAYFAST_PASSPHRASE;
		if (!passphrase) {
			console.error('PAYFAST_PASSPHRASE is not configured');
			return c.json({ error: 'Payment webhook not configured' }, 500);
		}

		let raw: string;
		try {
			raw = await c.req.text();
		} catch {
			console.warn('PayFast ITN: failed to read request body');
			return c.text('OK', 200);
		}

		const result = validateItn(raw, passphrase);

		if (!result.valid) {
			console.warn('PayFast ITN: invalid signature', { orderRef: result.orderRef });
			return c.text('OK', 200);
		}

		if (!result.orderRef) {
			console.warn('PayFast ITN: missing m_payment_id');
			return c.text('OK', 200);
		}

		// Order load moves before the non-COMPLETE branch so a failed-payment
		// email can fire to the customer (docs/payment-retry-plan.md Option A).
		// The COMPLETE-path checks below remain intact.
		let order;
		try {
			order = await getOrderByRef(result.orderRef);
		} catch (err) {
			console.error(`PayFast ITN: Sanity lookup failed for ${result.orderRef}`, err);
			return c.text('OK', 200);
		}

		if (!order) {
			console.warn(`PayFast ITN: order ${result.orderRef} not found in Sanity`);
			return c.text('OK', 200);
		}

		if (result.paymentStatus !== 'COMPLETE') {
			console.warn(
				`PayFast ITN: non-COMPLETE status "${result.paymentStatus}" for ${result.orderRef}`
			);
			// Fire the failed-payment email only for orders still in
			// pending_payment. If the order is already paid / shipped /
			// cancelled, a late-arriving "FAILED" ITN (PayFast retries
			// for up to 24h) must NOT email the customer — they've
			// either succeeded on retry or moved on, and a "your payment
			// didn't go through" email would be alarming.
			if (order.status === 'pending_payment') {
				try {
					const mail = paymentFailedTemplate(order);
					await sendEmail({
						to: order.customerEmail,
						subject: mail.subject,
						html: mail.html
					});
				} catch (err) {
					// Best-effort. PayFast still gets a 200 — no point
					// asking PayFast to retry the ITN just because Resend
					// hiccupped, and the customer can still retry via
					// /track. Stringify the error to keep PII out of logs.
					const message = err instanceof Error ? err.message : String(err);
					console.error(
						`PayFast ITN: failed-payment email failed for ${result.orderRef}: ${message}`
					);
				}
			}
			return c.text('OK', 200);
		}

		// Prevent double-processing: if the order is already past pending_payment, skip.
		if (order.status !== 'pending_payment') {
			console.warn(
				`PayFast ITN: order ${result.orderRef} is already "${order.status}" — skipping`
			);
			return c.text('OK', 200);
		}

		// Verify the amount matches what we stored on the order.
		if (
			order.amountZar != null &&
			Math.abs(order.amountZar - result.amountGross) > 0.01
		) {
			console.warn(
				`PayFast ITN: amount mismatch for ${result.orderRef} — ` +
					`expected ${order.amountZar}, got ${result.amountGross}`
			);
			return c.text('OK', 200);
		}

		try {
			await updateOrderStatus(result.orderRef, {
				status: 'payment_received',
				paymentId: result.pfPaymentId
			});
		} catch (err) {
			console.error(`PayFast ITN: failed to update order ${result.orderRef}`, err);
			return c.text('OK', 200);
		}

		return c.text('OK', 200);
	});

	return payfastItn;
}

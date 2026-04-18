import { Hono } from 'hono';
import { validateItn } from '../payfast.js';
import { getOrderByRef, updateOrderPayment } from '../sanity.js';
import { createRateLimiter } from '../rate-limit.js';

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

		if (result.paymentStatus !== 'COMPLETE') {
			console.warn(
				`PayFast ITN: non-COMPLETE status "${result.paymentStatus}" for ${result.orderRef}`
			);
			return c.text('OK', 200);
		}

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
			await updateOrderPayment(result.orderRef, {
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

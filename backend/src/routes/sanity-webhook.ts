import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sendEmail } from '../email.js';
import { customerEmailForStatus } from '../email-templates.js';
import { getOrderByRef } from '../orders-store.js';
import type { SanityOrder } from '../sanity.js';
import { createRateLimiter } from '../rate-limit.js';

/**
 * Sanity webhooks sign the raw request body with the configured secret and
 * include the signature in the `sanity-webhook-signature` header. The format
 * is `t=<unix-seconds>,v1=<base64url>` where v1 is HMAC-SHA256 of the
 * timestamp + '.' + raw body.
 *
 * See https://www.sanity.io/docs/webhooks#d3aff2ef5ed3 for the spec.
 */
function verifySignature(
	rawBody: string,
	header: string | undefined,
	secret: string
): boolean {
	if (!header) return false;

	const parts = Object.fromEntries(
		header.split(',').map((kv) => {
			const [k, ...rest] = kv.split('=');
			return [k?.trim() ?? '', rest.join('=').trim()];
		})
	);
	const timestamp = parts.t;
	const signature = parts.v1;
	if (!timestamp || !signature) return false;

	const payload = `${timestamp}.${rawBody}`;
	const expected = createHmac('sha256', secret).update(payload).digest('base64url');

	const a = Buffer.from(expected);
	const b = Buffer.from(signature);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export function sanityWebhookRouter() {
	const sanityWebhook = new Hono();

	// 60 webhook calls per source IP per minute — Sanity itself only fires on
	// status changes (low volume), so this comfortably accommodates legitimate
	// traffic while capping signature-brute-forcing attempts.
	const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

	sanityWebhook.post('/sanity-order', webhookLimiter, async (c) => {
		const secret = process.env.SANITY_WEBHOOK_SECRET;
		if (!secret) {
			console.error('SANITY_WEBHOOK_SECRET is not configured');
			return c.json({ error: 'Webhook not configured' }, 500);
		}

		const rawBody = await c.req.text();
		const signature = c.req.header('sanity-webhook-signature');

		if (!verifySignature(rawBody, signature, secret)) {
			console.warn('Rejected Sanity webhook with invalid signature');
			return c.json({ error: 'Invalid signature' }, 401);
		}

		let webhookOrder: SanityOrder;
		try {
			webhookOrder = JSON.parse(rawBody);
		} catch {
			return c.json({ error: 'Invalid JSON body' }, 400);
		}

		if (webhookOrder._type !== undefined && webhookOrder._type !== 'order') {
			return c.json({ ok: true, skipped: 'not an order document' });
		}

		if (!webhookOrder.orderRef) {
			console.warn('Sanity webhook payload missing orderRef — skipping');
			return c.json({ ok: true, skipped: 'no order ref' });
		}

		// Phase 1: the Sanity webhook payload no longer carries PII fields
		// (the Sanity doc itself is now PII-free). Join with DynamoDB to
		// recover customerEmail + customerName + tracking info before
		// rendering the status email.
		const order = await getOrderByRef(webhookOrder.orderRef);
		if (!order) {
			console.warn(
				`Sanity webhook for order ${webhookOrder.orderRef} could not be joined with DynamoDB — skipping`
			);
			return c.json({ ok: true, skipped: 'order not found' });
		}

		if (!order.customerEmail) {
			console.warn(
				`Sanity webhook for order ${order.orderRef} has no customerEmail — skipping`
			);
			return c.json({ ok: true, skipped: 'no customer email' });
		}

		const mail = customerEmailForStatus(order);
		if (!mail) {
			console.warn(`No email template for status "${order.status}" — skipping`);
			return c.json({ ok: true, skipped: 'no template' });
		}

		try {
			await sendEmail({
				to: order.customerEmail,
				subject: mail.subject,
				html: mail.html
			});
		} catch (err) {
			// Sanity retries aggressively on non-2xx responses — a permanently
			// broken send (Resend validation error, invalid recipient) would
			// retry forever with the frozen-at-event-time payload, eventually
			// flooding logs and blocking fresh events behind the retry queue.
			// Log the failure and ack 200 so Sanity stops retrying; operator
			// can re-trigger manually by bumping the doc status if needed.
			console.error(
				`Failed to send status update email for ${order.orderRef}`,
				err
			);
			return c.json({ ok: true, ref: order.orderRef, emailed: false });
		}

		return c.json({ ok: true, ref: order.orderRef, status: order.status });
	});

	return sanityWebhook;
}

import { Hono } from 'hono';
import { getOrderByRef, type Order } from '../orders-store.js';
import { type OrderStatus } from '../sanity.js';
import { createRateLimiter } from '../rate-limit.js';
import { emailsMatch } from '../email-match.js';

type TrackingResponse = {
	ref: string;
	status: OrderStatus;
	customerName: string;
	items: string;
	shipping: {
		carrier: string | null;
		trackingNumber: string | null;
		trackingUrl: string | null;
	} | null;
	createdAt: string;
	updatedAt: string;
};

function sanitise(order: Order): TrackingResponse {
	const hasShippingInfo =
		order.shippingCarrier || order.trackingNumber || order.trackingUrl;

	return {
		ref: order.orderRef,
		status: order.status,
		customerName: order.customerName,
		items: order.items,
		shipping: hasShippingInfo
			? {
					carrier: order.shippingCarrier,
					trackingNumber: order.trackingNumber,
					trackingUrl: order.trackingUrl
				}
			: null,
		createdAt: order._createdAt,
		updatedAt: order._updatedAt
	};
}

export function orderLookupRouter() {
	const orderLookup = new Hono();

	// 20 lookups per IP per minute — enough for a customer refreshing the
	// /track page repeatedly while waiting for status changes, but well
	// short of useful for ref/email enumeration.
	const lookupLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

	orderLookup.get('/:ref', lookupLimiter, async (c) => {
		const ref = c.req.param('ref');
		const email = c.req.query('email')?.trim().toLowerCase() ?? '';

		if (!ref || !email) {
			return c.json({ error: 'Order not found' }, 404);
		}

		let order: Order | null;
		try {
			order = await getOrderByRef(ref);
		} catch (err) {
			console.error('Order lookup failed', err);
			return c.json({ error: 'Order lookup failed. Please try again.' }, 500);
		}

		if (!order) {
			return c.json({ error: 'Order not found' }, 404);
		}

		if (!emailsMatch(order.customerEmail.trim().toLowerCase(), email)) {
			// Deliberately return the same 404 as "ref not found" to prevent
			// enumeration distinguishing valid refs from invalid ones.
			return c.json({ error: 'Order not found' }, 404);
		}

		return c.json(sanitise(order));
	});

	return orderLookup;
}

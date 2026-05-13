import { Hono } from 'hono';
import { adminAuth } from '../middleware/admin-auth.js';
import {
	getOrderPii,
	updateOrderInternalNotes,
	updateOrderTracking,
	type TrackingUpdate
} from '../orders-store.js';

// Admin endpoints powering the Studio custom panels. All routes are gated
// by the bearer-token middleware and CORS-scoped to the Studio origin in
// app.ts. Logs intentionally carry only `orderRef + action + result` —
// never PII values, matching the convention enforced by the regression
// test in email.test.ts.

export function adminRouter() {
	const admin = new Hono();
	admin.use('*', adminAuth);

	admin.get('/orders/:ref', async (c) => {
		const ref = c.req.param('ref');
		try {
			const pii = await getOrderPii(ref);
			if (!pii) {
				console.log(`admin GET /orders/${ref} -> 404`);
				return c.json({ error: 'Not found' }, 404);
			}
			console.log(`admin GET /orders/${ref} -> 200`);
			return c.json(pii);
		} catch (err) {
			console.error(`admin GET /orders/${ref} -> 500`, err);
			return c.json({ error: 'Internal server error' }, 500);
		}
	});

	admin.patch('/orders/:ref/tracking', async (c) => {
		const ref = c.req.param('ref');
		let body: Record<string, unknown>;
		try {
			body = (await c.req.json()) as Record<string, unknown>;
		} catch {
			return c.json({ error: 'Invalid JSON body.' }, 400);
		}

		const update: TrackingUpdate = {};
		for (const key of ['trackingNumber', 'trackingUrl', 'shippingCarrier'] as const) {
			if (!(key in body)) continue;
			const value = body[key];
			if (value === null) {
				update[key] = null;
			} else if (typeof value === 'string') {
				update[key] = value === '' ? null : value;
			} else {
				return c.json({ error: `${key} must be a string or null.` }, 400);
			}
		}

		try {
			await updateOrderTracking(ref, update);
			console.log(`admin PATCH /orders/${ref}/tracking -> 200`);
			return c.json({ ok: true });
		} catch (err) {
			console.error(`admin PATCH /orders/${ref}/tracking -> 500`, err);
			return c.json({ error: 'Internal server error' }, 500);
		}
	});

	admin.patch('/orders/:ref/internal-notes', async (c) => {
		const ref = c.req.param('ref');
		let body: Record<string, unknown>;
		try {
			body = (await c.req.json()) as Record<string, unknown>;
		} catch {
			return c.json({ error: 'Invalid JSON body.' }, 400);
		}

		const raw = body.internalNotes;
		let notes: string | null;
		if (raw === null || raw === undefined || raw === '') {
			notes = null;
		} else if (typeof raw === 'string') {
			notes = raw;
		} else {
			return c.json({ error: 'internalNotes must be a string or null.' }, 400);
		}

		try {
			await updateOrderInternalNotes(ref, notes);
			console.log(`admin PATCH /orders/${ref}/internal-notes -> 200`);
			return c.json({ ok: true });
		} catch (err) {
			console.error(`admin PATCH /orders/${ref}/internal-notes -> 500`, err);
			return c.json({ error: 'Internal server error' }, 500);
		}
	});

	return admin;
}

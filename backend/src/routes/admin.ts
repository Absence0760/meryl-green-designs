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
			console.error(`admin GET /orders/${ref} -> 500: ${errorMessage(err)}`);
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
				if (value === '') {
					update[key] = null;
				} else if (key === 'trackingUrl' && !isSafeHttpUrl(value)) {
					return c.json(
						{ error: 'trackingUrl must be an http:// or https:// URL.' },
						400
					);
				} else {
					update[key] = value;
				}
			} else {
				return c.json({ error: `${key} must be a string or null.` }, 400);
			}
		}

		try {
			await updateOrderTracking(ref, update);
			console.log(`admin PATCH /orders/${ref}/tracking -> 200`);
			return c.json({ ok: true });
		} catch (err) {
			console.error(`admin PATCH /orders/${ref}/tracking -> 500: ${errorMessage(err)}`);
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
			console.error(`admin PATCH /orders/${ref}/internal-notes -> 500: ${errorMessage(err)}`);
			return c.json({ error: 'Internal server error' }, 500);
		}
	});

	return admin;
}

// Defence-in-depth: never log the raw Error object on the 500 path.
// AWS SDK and Sanity SDK errors can in theory embed attribute values
// or response-body fragments in `.message`; this strips to `.message`
// only (matches the convention in orders-store.ts and the scripts)
// and gives a `String(err)` fallback for non-Error throws.
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

// trackingUrl is rendered into the customer's shipping email <a href> and
// into the /track page's status-card link. Without a protocol allowlist,
// an operator (or a compromised Studio session) could store a
// `javascript:` URL that some email clients render live. Reject anything
// that's not plain HTTP(S).
export function isSafeHttpUrl(value: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return false;
	}
	return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}

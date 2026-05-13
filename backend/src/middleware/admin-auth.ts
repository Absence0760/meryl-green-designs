import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'node:crypto';

// Bearer-token gate for /admin/* routes. Currently the only secret-grade
// auth on this stack — see docs/orders-pii-split-plan.md § Admin auth for
// the v2 hardening list (Sanity JWT, Cognito).
//
// 401 is intentionally generic so an attacker can't distinguish "wrong
// token format" from "valid token format, wrong value" via the response.
export const adminAuth = createMiddleware(async (c, next) => {
	const expected = process.env.ADMIN_API_TOKEN;
	if (!expected) {
		console.error('admin auth: ADMIN_API_TOKEN is not configured');
		return c.json({ error: 'Admin API is not configured.' }, 500);
	}

	const header = c.req.header('authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header);
	if (!match) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const provided = Buffer.from(match[1]!.trim());
	const reference = Buffer.from(expected);
	if (provided.length !== reference.length || !timingSafeEqual(provided, reference)) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	await next();
});

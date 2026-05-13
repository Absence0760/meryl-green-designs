import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { gallery } from './routes/gallery.js';
import { ordersRouter } from './routes/orders.js';
import { orderLookupRouter } from './routes/order-lookup.js';
import { enquiriesRouter } from './routes/enquiries.js';
import { products } from './routes/products.js';
import { testimonials } from './routes/testimonials.js';
import { payfastItnRouter } from './routes/payfast-itn.js';
import { sanityWebhookRouter } from './routes/sanity-webhook.js';
import { adminRouter } from './routes/admin.js';

function parseOrigins(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean);
}

export function createApp() {
	const app = new Hono();

	const publicOrigins = parseOrigins(process.env.ALLOWED_ORIGINS ?? 'http://localhost:7777');
	// Admin routes are CORS-scoped narrower than public routes: only the
	// Studio's hosted origin should be able to PATCH order PII. The bearer
	// token is the real gate; this is defence-in-depth.
	const adminOrigins = parseOrigins(process.env.STUDIO_ORIGINS);

	// Matches `/admin` or `/admin/...` but not `/admintools` or other
	// prefix collisions — keeps the narrow CORS scope from leaking onto
	// unrelated future routes that happen to start with the same five
	// letters.
	const adminPathRe = /^\/admin(?:\/|$)/;
	app.use(
		'*',
		cors({
			origin: (origin: string, c: Context) => {
				const allowed = adminPathRe.test(c.req.path) ? adminOrigins : publicOrigins;
				return allowed.includes(origin) ? origin : null;
			},
			allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
			allowHeaders: ['Content-Type', 'Authorization'],
			maxAge: 600
		})
	);

	app.get('/health', (c) => c.json({ ok: true }));

	app.route('/products', products);
	app.route('/gallery', gallery);
	app.route('/testimonials', testimonials);

	// Rate-limited routes use factory functions so each createApp() call
	// produces fresh limiter buckets — important for test isolation and
	// also a cleaner pattern in general.
	app.route('/orders', ordersRouter());
	app.route('/orders', orderLookupRouter());
	app.route('/enquiries', enquiriesRouter());
	app.route('/webhooks', sanityWebhookRouter());
	app.route('/webhooks/payfast-itn', payfastItnRouter());
	app.route('/admin', adminRouter());

	app.onError((err, c) => {
		console.error('Unhandled error', err);
		return c.json({ error: 'Internal server error' }, 500);
	});

	return app;
}

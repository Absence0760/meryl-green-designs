import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { gallery } from './routes/gallery.js';
import { ordersRouter } from './routes/orders.js';
import { orderLookupRouter } from './routes/order-lookup.js';
import { enquiriesRouter } from './routes/enquiries.js';
import { products } from './routes/products.js';
import { testimonials } from './routes/testimonials.js';
import { payfastItnRouter } from './routes/payfast-itn.js';
import { sanityWebhookRouter } from './routes/sanity-webhook.js';

export function createApp() {
	const app = new Hono();

	const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:7777')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean);

	app.use(
		'*',
		cors({
			origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
			allowMethods: ['GET', 'POST', 'OPTIONS'],
			allowHeaders: ['Content-Type'],
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

	app.onError((err, c) => {
		console.error('Unhandled error', err);
		return c.json({ error: 'Internal server error' }, 500);
	});

	return app;
}

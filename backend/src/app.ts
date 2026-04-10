import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { orders } from './routes/orders.js';
import { orderLookup } from './routes/order-lookup.js';
import { sanityWebhook } from './routes/sanity-webhook.js';

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

	app.route('/orders', orders);
	app.route('/orders', orderLookup);
	app.route('/webhooks', sanityWebhook);

	app.onError((err, c) => {
		console.error('Unhandled error', err);
		return c.json({ error: 'Internal server error' }, 500);
	});

	return app;
}

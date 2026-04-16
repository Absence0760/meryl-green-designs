import { Hono } from 'hono';
import { sendEmail } from '../email.js';
import { ownerNotification } from '../email-templates.js';
import { createOrder, getProductsByIds } from '../sanity.js';
import { buildPaymentFormData, type PayFastConfig } from '../payfast.js';
import { createRateLimiter } from '../rate-limit.js';

type CartItem = { productId: string; quantity: number };

type OrderFields = {
	name: string;
	email: string;
	phone: string;
	address: string;
	notes: string;
	cart: CartItem[];
};

const MAX_LEN = {
	name: 120,
	email: 200,
	phone: 40,
	address: 500,
	notes: 1000
} as const;

function generateOrderRef(): string {
	const now = new Date();
	const y = now.getFullYear().toString().slice(-2);
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	// 6 base-36 chars = ~2.2 billion combinations per day. Combined with
	// email verification on /orders/:ref, brute-force enumeration is
	// computationally infeasible — see docs/security.md § Risk 3.
	const rand = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
	return `MG-${y}${m}${d}-${rand}`;
}

function validate(data: OrderFields): string | null {
	if (!data.name.trim()) return 'Please enter your name.';
	if (!data.email.trim()) return 'Please enter your email address.';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Please enter a valid email address.';
	if (!data.address.trim()) return 'Please enter a shipping address.';

	if (!data.cart || data.cart.length === 0) {
		return 'Please add at least one product to your order.';
	}

	for (const item of data.cart) {
		if (!item.productId || typeof item.quantity !== 'number' || item.quantity < 1) {
			return 'Invalid cart item.';
		}
	}

	for (const [key, limit] of Object.entries(MAX_LEN) as [keyof typeof MAX_LEN, number][]) {
		if (data[key] && data[key].length > limit) return `${key} is too long (max ${limit} characters).`;
	}
	return null;
}

function getPayFastConfig(): PayFastConfig | null {
	const merchantId = process.env.PAYFAST_MERCHANT_ID;
	const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
	const passphrase = process.env.PAYFAST_PASSPHRASE;
	if (!merchantId || !merchantKey || !passphrase) return null;
	return {
		merchantId,
		merchantKey,
		passphrase,
		sandbox: process.env.PAYFAST_SANDBOX === 'true'
	};
}

function siteUrl(): string {
	return (process.env.SITE_URL ?? 'http://localhost:7777').replace(/\/$/, '');
}

function apiUrl(): string {
	return (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`).replace(/\/$/, '');
}

export function ordersRouter() {
	const orders = new Hono();

	// 5 order submissions per IP per 15 minutes — generous for legitimate
	// retries (failed payment, validation correction) but caps spam.
	const orderLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });

	orders.post('/', orderLimiter, async (c) => {
		let body: Partial<OrderFields & { website?: string; paymentMethod?: string; items?: string }>;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'Invalid JSON body.' }, 400);
		}

		if (body.website) {
			return c.json({ success: true, ref: 'SKIPPED' });
		}

		const data: OrderFields = {
			name: (body.name ?? '').trim(),
			email: (body.email ?? '').trim(),
			phone: (body.phone ?? '').trim(),
			address: (body.address ?? '').trim(),
			notes: (body.notes ?? '').trim(),
			cart: Array.isArray(body.cart) ? body.cart : []
		};

		const error = validate(data);
		if (error) {
			return c.json({ error }, 400);
		}

		const ownerEmail = process.env.OWNER_EMAIL;
		if (!ownerEmail) {
			console.error('OWNER_EMAIL is not configured');
			return c.json({ error: 'Order cannot be processed: server is not configured.' }, 500);
		}

		const pfConfig = getPayFastConfig();
		if (!pfConfig) {
			return c.json({ error: 'Payment processing is not configured.' }, 500);
		}

		// Look up product prices in Sanity and compute the total server-side.
		const productIds = data.cart.map((item) => item.productId);
		let products;
		try {
			products = await getProductsByIds(productIds);
		} catch (err) {
			console.error('Failed to look up products for cart', err);
			return c.json({ error: 'Sorry, something went wrong verifying your order. Please try again.' }, 500);
		}

		const productMap = new Map(products.map((p) => [p._id, p]));
		const lines: string[] = [];
		let total = 0;

		for (const item of data.cart) {
			const product = productMap.get(item.productId);
			if (!product) {
				return c.json({ error: `Product "${item.productId}" is not available.` }, 400);
			}
			if (product.priceZar == null) {
				return c.json({ error: `Product "${product.name}" does not have a price.` }, 400);
			}
			const lineTotal = product.priceZar * item.quantity;
			total += lineTotal;
			lines.push(`${item.quantity} x ${product.name} — R ${product.priceZar.toFixed(2)}`);
		}

		const amountZar = Math.round(total * 100) / 100;
		const itemsText = lines.join('\n');

		const ref = generateOrderRef();

		let sanityOrder;
		try {
			sanityOrder = await createOrder({
				orderRef: ref,
				customerName: data.name,
				customerEmail: data.email,
				customerPhone: data.phone,
				shippingAddress: data.address,
				items: itemsText,
				customerNotes: data.notes,
				paymentMethod: 'payfast',
				amountZar
			});
		} catch (err) {
			console.error('Failed to create Sanity order document', err);
			return c.json(
				{ error: 'Sorry, something went wrong saving your order. Please try again.' },
				500
			);
		}

		// Send owner notification. Customer gets their email after PayFast
		// confirms payment via ITN → Sanity webhook → status email.
		try {
			const ownerMail = ownerNotification({
				orderRef: ref,
				name: data.name,
				email: data.email,
				phone: data.phone,
				address: data.address,
				items: itemsText,
				notes: data.notes,
				paymentMethod: 'payfast',
				amountZar
			});
			await sendEmail({
				to: ownerEmail,
				subject: ownerMail.subject,
				html: ownerMail.html,
				replyTo: data.email
			});
		} catch (err) {
			console.error('Order email failed', err);
			return c.json(
				{
					success: true,
					ref,
					warning:
						"Your order was saved, but we couldn't send the notification email. We'll contact you shortly."
				},
				200
			);
		}

		const site = siteUrl();
		const api = apiUrl();

		const formData = buildPaymentFormData(pfConfig, {
			orderRef: ref,
			amountZar,
			itemName: `Meryl Green Designs order ${ref}`,
			customerName: data.name,
			customerEmail: data.email,
			returnUrl: `${site}/payment/complete?ref=${encodeURIComponent(ref)}`,
			cancelUrl: `${site}/payment/cancelled?ref=${encodeURIComponent(ref)}`,
			notifyUrl: `${api}/webhooks/payfast-itn`
		});

		return c.json({ success: true, ref, payfast: formData });
	});

	return orders;
}

import { Hono } from 'hono';
import { sendEmail } from '../email.js';
import { customerEmailForStatus, ownerNotification } from '../email-templates.js';
import { createOrder } from '../sanity.js';

type OrderFields = {
	name: string;
	email: string;
	phone: string;
	address: string;
	items: string;
	notes: string;
};

const MAX_LEN = {
	name: 120,
	email: 200,
	phone: 40,
	address: 500,
	items: 2000,
	notes: 1000
} as const;

function generateOrderRef(): string {
	const now = new Date();
	const y = now.getFullYear().toString().slice(-2);
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `MG-${y}${m}${d}-${rand}`;
}

function validate(data: OrderFields): string | null {
	if (!data.name.trim()) return 'Please enter your name.';
	if (!data.email.trim()) return 'Please enter your email address.';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Please enter a valid email address.';
	if (!data.address.trim()) return 'Please enter a shipping address.';
	if (!data.items.trim()) return 'Please list the items you would like to order.';

	for (const [key, limit] of Object.entries(MAX_LEN) as [keyof typeof MAX_LEN, number][]) {
		if (data[key].length > limit) return `${key} is too long (max ${limit} characters).`;
	}
	return null;
}

export const orders = new Hono();

orders.post('/', async (c) => {
	let body: Partial<OrderFields & { website?: string }>;
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
		items: (body.items ?? '').trim(),
		notes: (body.notes ?? '').trim()
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

	const ref = generateOrderRef();

	let sanityOrder;
	try {
		sanityOrder = await createOrder({
			orderRef: ref,
			customerName: data.name,
			customerEmail: data.email,
			customerPhone: data.phone,
			shippingAddress: data.address,
			items: data.items,
			customerNotes: data.notes
		});
	} catch (err) {
		console.error('Failed to create Sanity order document', err);
		return c.json(
			{ error: 'Sorry, something went wrong saving your order. Please try again.' },
			500
		);
	}

	try {
		const ownerMail = ownerNotification({
			orderRef: ref,
			name: data.name,
			email: data.email,
			phone: data.phone,
			address: data.address,
			items: data.items,
			notes: data.notes
		});
		await sendEmail({
			to: ownerEmail,
			subject: ownerMail.subject,
			html: ownerMail.html,
			replyTo: data.email
		});

		const customerMail = customerEmailForStatus(sanityOrder);
		if (customerMail) {
			await sendEmail({
				to: data.email,
				subject: customerMail.subject,
				html: customerMail.html
			});
		}
	} catch (err) {
		console.error('Order email failed', err);
		return c.json(
			{
				success: true,
				ref,
				warning:
					"Your order was saved, but we couldn't send the confirmation email. We'll contact you shortly."
			},
			200
		);
	}

	return c.json({ success: true, ref });
});

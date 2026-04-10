import { Hono } from 'hono';
import { sendEmail, escapeHtml } from '../email.js';

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

function ownerEmailHtml(ref: string, data: OrderFields): string {
	return `
		<h2>New order — ${escapeHtml(ref)}</h2>
		<p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
		<p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
		<p><strong>Phone:</strong> ${escapeHtml(data.phone) || '(not provided)'}</p>
		<p><strong>Shipping address:</strong><br>${escapeHtml(data.address).replace(/\n/g, '<br>')}</p>
		<h3>Items</h3>
		<pre style="font-family: inherit; white-space: pre-wrap;">${escapeHtml(data.items)}</pre>
		${data.notes ? `<h3>Notes</h3><p>${escapeHtml(data.notes).replace(/\n/g, '<br>')}</p>` : ''}
	`;
}

function customerEmailHtml(ref: string, data: OrderFields): string {
	return `
		<h2>Thank you for your order</h2>
		<p>Hi ${escapeHtml(data.name)},</p>
		<p>We've received your order request. Your reference number is:</p>
		<p style="font-size: 1.25rem;"><strong>${escapeHtml(ref)}</strong></p>
		<p>Please make payment by Electronic Funds Transfer using the banking details below, and
		use <strong>${escapeHtml(ref)}</strong> as your payment reference.</p>
		<h3>Banking details</h3>
		<p>
			Account name: [ To be provided ]<br>
			Bank: [ To be provided ]<br>
			Account number: [ To be provided ]<br>
			Branch code: [ To be provided ]<br>
			Reference: ${escapeHtml(ref)}
		</p>
		<p>Your order will be shipped once payment reflects in the account. We'll be in touch shortly
		to confirm.</p>
		<p>— Meryl Green Designs</p>
	`;
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

	try {
		await sendEmail({
			to: ownerEmail,
			subject: `New order ${ref} — ${data.name}`,
			html: ownerEmailHtml(ref, data),
			replyTo: data.email
		});

		await sendEmail({
			to: data.email,
			subject: `Order confirmation ${ref} — Meryl Green Designs`,
			html: customerEmailHtml(ref, data)
		});
	} catch (err) {
		console.error('Order email failed', err);
		return c.json(
			{ error: 'Sorry, something went wrong sending your order. Please try again.' },
			500
		);
	}

	return c.json({ success: true, ref });
});

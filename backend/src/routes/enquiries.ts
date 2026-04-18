import { Hono } from 'hono';
import { sendEmail } from '../email.js';
import { commissionEnquiry, type CommissionEnquiryInput } from '../email-templates.js';
import { createRateLimiter } from '../rate-limit.js';

type EnquiryFields = CommissionEnquiryInput;

const MAX_LEN = {
	name: 120,
	email: 200,
	phone: 40,
	photoReference: 200,
	size: 200,
	finish: 200,
	location: 200,
	message: 4000
} as const;

function validate(data: EnquiryFields): string | null {
	if (!data.name.trim()) return 'Please enter your name.';
	if (!data.email.trim()) return 'Please enter your email address.';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Please enter a valid email address.';
	if (!data.message.trim()) return 'Please tell us a little about what you have in mind.';

	for (const [key, limit] of Object.entries(MAX_LEN) as [keyof typeof MAX_LEN, number][]) {
		if (data[key] && data[key].length > limit) {
			return `${key} is too long (max ${limit} characters).`;
		}
	}
	return null;
}

export function enquiriesRouter() {
	const enquiries = new Hono();

	// Same shape as POST /orders: 5 per IP per 15 minutes. Generous for a
	// person browsing and submitting once or twice; restrictive for spam.
	const enquiryLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });

	enquiries.post('/', enquiryLimiter, async (c) => {
		let body: Partial<EnquiryFields & { website?: string }>;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'Invalid JSON body.' }, 400);
		}

		// Honeypot — same convention as /orders. A filled `website` field
		// returns a successful-looking response without doing any work.
		if (body.website) {
			return c.json({ success: true });
		}

		const data: EnquiryFields = {
			name: (body.name ?? '').trim(),
			email: (body.email ?? '').trim(),
			phone: (body.phone ?? '').trim(),
			photoReference: (body.photoReference ?? '').trim(),
			size: (body.size ?? '').trim(),
			finish: (body.finish ?? '').trim(),
			location: (body.location ?? '').trim(),
			message: (body.message ?? '').trim()
		};

		const error = validate(data);
		if (error) {
			return c.json({ error }, 400);
		}

		const ownerEmail = process.env.OWNER_EMAIL;
		if (!ownerEmail) {
			console.error('OWNER_EMAIL is not configured');
			return c.json({ error: 'Enquiry cannot be sent: server is not configured.' }, 500);
		}

		const mail = commissionEnquiry(data);
		try {
			await sendEmail({
				to: ownerEmail,
				subject: mail.subject,
				html: mail.html,
				replyTo: data.email
			});
		} catch (err) {
			console.error('Commission enquiry email failed', err);
			return c.json(
				{ error: "Sorry, we couldn't send your enquiry. Please try again or email us directly." },
				500
			);
		}

		return c.json({ success: true });
	});

	return enquiries;
}

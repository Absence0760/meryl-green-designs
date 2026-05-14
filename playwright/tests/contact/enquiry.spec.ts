import { test, expect } from '@playwright/test';
import { clearCapturedEmails, waitForEmail, listCapturedEmails } from '../../helpers/read-email.ts';

// Commission enquiry form on /contact submits to POST /enquiries.
// The backend validates required fields, runs an email through
// Resend (file backend in tests), and returns success/failure JSON.
// No Sanity write, no DynamoDB row — enquiries are transient by
// design (see backend/src/routes/enquiries.ts and features.md).

const apiUrl = () => process.env.API_URL!;
const siteUrl = () => process.env.SITE_URL!;

const validPayload = {
	name: 'Pat Visitor',
	email: 'pat@e2e.local',
	phone: '0821234567',
	photoReference: 'gallery photo two',
	size: '~ 1500 x 1800',
	finish: 'walnut stain',
	location: "hallway, north-facing wall",
	message: 'Hi Meryl, I would love to commission a screen for our hallway.',
};

function postEnquiry(request: import('@playwright/test').APIRequestContext, overrides: Record<string, unknown> = {}) {
	return request.post(`${apiUrl()}/enquiries`, {
		headers: { 'content-type': 'application/json', origin: siteUrl() },
		data: { ...validPayload, website: '', ...overrides },
	});
}

test.describe('POST /enquiries', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	test('happy path: valid enquiry sends one owner email with the visitor as reply-to', async ({
		request,
	}) => {
		const res = await postEnquiry(request);
		expect(res.status()).toBe(200);
		const body = (await res.json()) as { success: boolean };
		expect(body.success).toBe(true);

		const emails = await waitForEmail(
			(e) => e.to === process.env.OWNER_EMAIL && /commission enquiry/i.test(e.subject),
		);
		expect(emails).toHaveLength(1);

		const email = emails[0];
		expect(email.subject).toContain('Pat Visitor');
		expect(email.replyTo).toBe('pat@e2e.local');
		// Every visitor-supplied field flows through escapeHtml() before
		// being interpolated into the body — assert each one appears.
		expect(email.bodyHtml).toContain('Pat Visitor');
		expect(email.bodyHtml).toContain('pat@e2e.local');
		expect(email.bodyHtml).toContain('0821234567');
		expect(email.bodyHtml).toContain('gallery photo two');
		expect(email.bodyHtml).toContain('1500 x 1800');
		expect(email.bodyHtml).toContain('walnut stain');
		expect(email.bodyHtml).toContain('north-facing wall');
		expect(email.bodyHtml).toContain('commission a screen');
	});

	test('honeypot: filled `website` field returns success but sends no email', async ({
		request,
	}) => {
		const res = await postEnquiry(request, { website: 'https://example.com/bot' });
		expect(res.status()).toBe(200);
		const body = (await res.json()) as { success: boolean };
		expect(body.success).toBe(true);

		// Wait a beat then confirm nothing was captured
		await new Promise((r) => setTimeout(r, 500));
		const all = await listCapturedEmails();
		expect(all).toHaveLength(0);
	});

	for (const [label, overrides, expectedError] of [
		['empty name', { name: '' }, /please enter your name/i],
		['empty email', { email: '' }, /please enter your email/i],
		['malformed email', { email: 'not-an-email' }, /valid email/i],
		['empty message', { message: '' }, /tell us/i],
	] as const) {
		test(`rejects ${label} with 400`, async ({ request }) => {
			const res = await postEnquiry(request, overrides);
			expect(res.status()).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(expectedError);

			await new Promise((r) => setTimeout(r, 200));
			const all = await listCapturedEmails();
			expect(all).toHaveLength(0);
		});
	}

	test('rejects oversize message with 400', async ({ request }) => {
		const res = await postEnquiry(request, { message: 'x'.repeat(5000) });
		expect(res.status()).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/too long/i);
	});

	test('CORS: requests from a non-allowlisted origin are blocked', async ({ request }) => {
		const res = await request.post(`${apiUrl()}/enquiries`, {
			headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
			data: validPayload,
		});
		// Hono's cors() returns the body but omits the
		// access-control-allow-origin header for unlisted origins;
		// browsers reject the response. From a server-side curl/test
		// we can still observe the missing header.
		expect(res.headers()['access-control-allow-origin']).toBeUndefined();
	});
});

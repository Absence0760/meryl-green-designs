import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../email.js', async () => {
	const actual = await vi.importActual<typeof import('../email.js')>('../email.js');
	return {
		...actual,
		sendEmail: vi.fn().mockResolvedValue(undefined)
	};
});

import { createApp } from '../app.js';
import * as email from '../email.js';

const validBody = {
	name: 'Jane Smith',
	email: 'jane@example.com',
	phone: '0123456789',
	photoReference: 'Sunbird screen — sand finish',
	size: '1.5m × 1.8m',
	finish: 'Meranti, light wax',
	location: 'Living room divider',
	message: 'Looking for something similar to the photograph in your gallery — could you quote?'
};

function postEnquiry(body: unknown) {
	const app = createApp();
	return app.request('/enquiries', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('POST /enquiries', () => {
	beforeEach(() => {
		vi.mocked(email.sendEmail).mockClear().mockResolvedValue(undefined);
	});

	afterEach(() => vi.unstubAllEnvs());

	it('sends an email to OWNER_EMAIL on a valid submission', async () => {
		const res = await postEnquiry(validBody);
		expect(res.status).toBe(200);
		const data = (await res.json()) as { success: boolean };
		expect(data.success).toBe(true);
		expect(email.sendEmail).toHaveBeenCalledOnce();
		const call = vi.mocked(email.sendEmail).mock.calls[0]![0];
		expect(call.to).toBe('owner@example.com');
		expect(call.replyTo).toBe('jane@example.com');
		expect(call.subject).toContain('Jane Smith');
		expect(call.html).toContain('Sunbird screen');
		expect(call.html).toContain('Meranti, light wax');
		expect(call.html).toContain('have not been verified');
	});

	it('treats a filled honeypot as a silent skip — no email sent', async () => {
		const res = await postEnquiry({ ...validBody, website: 'http://spam.example' });
		expect(res.status).toBe(200);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects when name is missing', async () => {
		const res = await postEnquiry({ ...validBody, name: '' });
		expect(res.status).toBe(400);
		const data = (await res.json()) as { error: string };
		expect(data.error).toMatch(/name/i);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects when email is missing', async () => {
		const res = await postEnquiry({ ...validBody, email: '' });
		expect(res.status).toBe(400);
	});

	it('rejects when email is malformed', async () => {
		const res = await postEnquiry({ ...validBody, email: 'not-an-email' });
		expect(res.status).toBe(400);
	});

	it('rejects when message is missing', async () => {
		const res = await postEnquiry({ ...validBody, message: '' });
		expect(res.status).toBe(400);
		const data = (await res.json()) as { error: string };
		expect(data.error).toMatch(/mind|tell us/i);
	});

	it('returns 400 on invalid JSON body', async () => {
		const app = createApp();
		const res = await app.request('/enquiries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not json'
		});
		expect(res.status).toBe(400);
	});

	it('returns 500 when OWNER_EMAIL is not configured', async () => {
		vi.stubEnv('OWNER_EMAIL', '');
		const res = await postEnquiry(validBody);
		expect(res.status).toBe(500);
		const data = (await res.json()) as { error: string };
		expect(data.error).toMatch(/not configured/i);
	});

	it('returns 500 (not 200) when Resend rejects the send', async () => {
		vi.mocked(email.sendEmail).mockRejectedValueOnce(new Error('Resend down'));
		const res = await postEnquiry(validBody);
		expect(res.status).toBe(500);
	});

	it('caps message length at the documented limit', async () => {
		const res = await postEnquiry({ ...validBody, message: 'x'.repeat(4001) });
		expect(res.status).toBe(400);
		const data = (await res.json()) as { error: string };
		expect(data.error).toMatch(/too long/i);
	});

	it('rate-limits after 5 submissions from the same IP', async () => {
		const app = createApp();
		const headers = {
			'Content-Type': 'application/json',
			'x-forwarded-for': '198.51.100.99'
		};
		const body = JSON.stringify(validBody);

		for (let i = 0; i < 5; i++) {
			const res = await app.request('/enquiries', { method: 'POST', headers, body });
			expect(res.status).toBe(200);
		}
		const sixth = await app.request('/enquiries', { method: 'POST', headers, body });
		expect(sixth.status).toBe(429);
	});
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// Mock email and sanity modules BEFORE importing app.
vi.mock('../email.js', async () => {
	const actual = await vi.importActual<typeof import('../email.js')>('../email.js');
	return {
		...actual,
		sendEmail: vi.fn().mockResolvedValue(undefined)
	};
});
vi.mock('../sanity.js', () => ({
	createOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	getProducts: vi.fn(),
	getGalleryPhotos: vi.fn(),
	getProductsByIds: vi.fn(),
	updateOrderPayment: vi.fn()
}));

import { createApp } from '../app.js';
import * as email from '../email.js';

const WEBHOOK_SECRET = 'test-webhook-secret';

/**
 * Reproduce Sanity's webhook signature format:
 *   t=<unix-seconds>,v1=<base64url(hmac-sha256(timestamp + '.' + rawBody))>
 */
function signPayload(rawBody: string, secret = WEBHOOK_SECRET): string {
	const timestamp = '1234567890';
	const payload = `${timestamp}.${rawBody}`;
	const sig = createHmac('sha256', secret).update(payload).digest('base64url');
	return `t=${timestamp},v1=${sig}`;
}

function makeOrderDoc(overrides: Record<string, unknown> = {}) {
	return {
		_id: 'order-1',
		_type: 'order',
		_createdAt: '2026-04-10T12:00:00Z',
		_updatedAt: '2026-04-10T12:00:00Z',
		orderRef: 'MG-260410-ABCD',
		status: 'payment_received' as const,
		paymentMethod: 'eft',
		amountZar: null,
		paymentId: null,
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: null,
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen',
		customerNotes: null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		...overrides
	};
}

describe('POST /webhooks/sanity-order', () => {
	beforeEach(() => {
		vi.mocked(email.sendEmail).mockClear();
	});

	it('accepts a request with a valid signature and dispatches the matching email', async () => {
		const body = JSON.stringify(makeOrderDoc());
		const signature = signPayload(body);

		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': signature
			},
			body
		});

		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data).toMatchObject({ ok: true, ref: 'MG-260410-ABCD', status: 'payment_received' });
		expect(email.sendEmail).toHaveBeenCalledOnce();
		expect(vi.mocked(email.sendEmail).mock.calls[0]![0].to).toBe('jane@example.com');
	});

	it('rejects a request with no signature header (401)', async () => {
		const body = JSON.stringify(makeOrderDoc());
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body
		});
		expect(res.status).toBe(401);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects a request signed with the wrong secret (401)', async () => {
		const body = JSON.stringify(makeOrderDoc());
		const badSignature = signPayload(body, 'not-the-right-secret');
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': badSignature
			},
			body
		});
		expect(res.status).toBe(401);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects a request where the body was tampered with after signing', async () => {
		const original = JSON.stringify(makeOrderDoc());
		const signature = signPayload(original);
		// Sign the original body but send a different one.
		const tamperedBody = JSON.stringify(makeOrderDoc({ customerEmail: 'attacker@example.com' }));
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': signature
			},
			body: tamperedBody
		});
		expect(res.status).toBe(401);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects a malformed signature header (401)', async () => {
		const body = JSON.stringify(makeOrderDoc());
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': 'this is not a valid header'
			},
			body
		});
		expect(res.status).toBe(401);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('skips when document has no customerEmail (200, no email sent)', async () => {
		const body = JSON.stringify(makeOrderDoc({ customerEmail: '' }));
		const signature = signPayload(body);
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': signature
			},
			body
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.skipped).toBe('no customer email');
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('skips documents that are not orders (200, no email sent)', async () => {
		const body = JSON.stringify({ _type: 'product', name: 'Not an order' });
		const signature = signPayload(body);
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': signature
			},
			body
		});
		expect(res.status).toBe(200);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects invalid JSON with a signature (400)', async () => {
		const body = 'not-json';
		const signature = signPayload(body);
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': signature
			},
			body
		});
		expect(res.status).toBe(400);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	describe('without SANITY_WEBHOOK_SECRET', () => {
		afterEach(() => vi.unstubAllEnvs());

		it('returns 500 before attempting signature verification', async () => {
			vi.stubEnv('SANITY_WEBHOOK_SECRET', '');
			const body = JSON.stringify(makeOrderDoc());
			const app = createApp();
			const res = await app.request('/webhooks/sanity-order', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					// Any signature — route should short-circuit before checking it.
					'sanity-webhook-signature': 't=1,v1=nope'
				},
				body
			});
			expect(res.status).toBe(500);
			expect(email.sendEmail).not.toHaveBeenCalled();
		});
	});

	it('returns 500 when sendEmail throws on a valid signed request', async () => {
		vi.mocked(email.sendEmail).mockRejectedValueOnce(new Error('resend down'));
		const body = JSON.stringify(makeOrderDoc());
		const signature = signPayload(body);
		const app = createApp();
		const res = await app.request('/webhooks/sanity-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'sanity-webhook-signature': signature
			},
			body
		});
		expect(res.status).toBe(500);
		const data = (await res.json()) as any;
		expect(data.error).toMatch(/email/i);
	});
});

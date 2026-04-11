import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SanityOrder } from '../sanity.js';

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
	getGalleryPhotos: vi.fn()
}));

import { createApp } from '../app.js';
import * as email from '../email.js';
import * as sanity from '../sanity.js';

function sanityOrder(overrides: Partial<SanityOrder> = {}): SanityOrder {
	return {
		_id: 'order-1',
		_type: 'order',
		_createdAt: '2026-04-10T12:00:00Z',
		_updatedAt: '2026-04-10T12:00:00Z',
		orderRef: 'MG-260410-ABCD',
		status: 'pending_payment',
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

const validOrderBody = {
	name: 'Jane Smith',
	email: 'jane@example.com',
	phone: '0123456789',
	address: '1 Test Street\nCape Town',
	items: '1 x Small Screen',
	notes: 'Please gift wrap'
};

function postOrder(body: unknown) {
	const app = createApp();
	return app.request('/orders', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('POST /orders', () => {
	beforeEach(() => {
		vi.mocked(email.sendEmail).mockClear().mockResolvedValue(undefined);
		vi.mocked(sanity.createOrder).mockClear().mockResolvedValue(sanityOrder());
	});

	it('validates and creates a Sanity order on a valid submission', async () => {
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.success).toBe(true);
		expect(data.ref).toMatch(/^MG-\d{6}-[A-Z0-9]{4}$/);
		expect(sanity.createOrder).toHaveBeenCalledOnce();

		const createArg = vi.mocked(sanity.createOrder).mock.calls[0]![0];
		expect(createArg.customerName).toBe('Jane Smith');
		expect(createArg.customerEmail).toBe('jane@example.com');
		expect(createArg.orderRef).toMatch(/^MG-\d{6}-[A-Z0-9]{4}$/);
	});

	it('sends two emails on success (owner notification + customer confirmation)', async () => {
		await postOrder(validOrderBody);
		expect(email.sendEmail).toHaveBeenCalledTimes(2);
		const sends = vi.mocked(email.sendEmail).mock.calls.map((c) => c[0]);
		const owner = sends.find((s) => s.to === 'owner@example.com');
		const customer = sends.find((s) => s.to === 'jane@example.com');
		expect(owner).toBeDefined();
		expect(customer).toBeDefined();
		expect(owner!.replyTo).toBe('jane@example.com');
	});

	it('treats a filled honeypot as a silent skip', async () => {
		const res = await postOrder({ ...validOrderBody, website: 'http://spam.example' });
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.ref).toBe('SKIPPED');
		expect(sanity.createOrder).not.toHaveBeenCalled();
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('rejects invalid JSON (400)', async () => {
		const app = createApp();
		const res = await app.request('/orders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not-json'
		});
		expect(res.status).toBe(400);
	});

	describe('validation', () => {
		const cases = [
			{ field: 'name', body: { ...validOrderBody, name: '' }, message: /name/i },
			{ field: 'email', body: { ...validOrderBody, email: '' }, message: /email/i },
			{
				field: 'email format',
				body: { ...validOrderBody, email: 'not-an-email' },
				message: /valid email/i
			},
			{ field: 'address', body: { ...validOrderBody, address: '' }, message: /address/i },
			{ field: 'items', body: { ...validOrderBody, items: '' }, message: /items|order/i },
			{
				field: 'name length',
				body: { ...validOrderBody, name: 'x'.repeat(121) },
				message: /too long/i
			},
			{
				field: 'items length',
				body: { ...validOrderBody, items: 'x'.repeat(2001) },
				message: /too long/i
			},
			{
				field: 'phone length',
				body: { ...validOrderBody, phone: '0'.repeat(41) },
				message: /too long/i
			},
			{
				field: 'address length',
				body: { ...validOrderBody, address: 'x'.repeat(501) },
				message: /too long/i
			},
			{
				field: 'notes length',
				body: { ...validOrderBody, notes: 'x'.repeat(1001) },
				message: /too long/i
			}
		];

		for (const { field, body, message } of cases) {
			it(`rejects missing or invalid ${field} (400)`, async () => {
				const res = await postOrder(body);
				expect(res.status).toBe(400);
				const data = (await res.json()) as any;
				expect(data.error).toMatch(message);
				expect(sanity.createOrder).not.toHaveBeenCalled();
				expect(email.sendEmail).not.toHaveBeenCalled();
			});
		}
	});

	it('returns 500 when Sanity create fails (no emails sent)', async () => {
		vi.mocked(sanity.createOrder).mockRejectedValueOnce(new Error('sanity exploded'));
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(500);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('returns 200 with a warning when email fails but Sanity already succeeded', async () => {
		vi.mocked(email.sendEmail).mockRejectedValueOnce(new Error('resend down'));
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.success).toBe(true);
		expect(data.warning).toBeDefined();
		expect(sanity.createOrder).toHaveBeenCalledOnce();
	});

	describe('without OWNER_EMAIL', () => {
		afterEach(() => vi.unstubAllEnvs());

		it('returns 500 and does not create a Sanity order', async () => {
			vi.stubEnv('OWNER_EMAIL', '');
			const res = await postOrder(validOrderBody);
			expect(res.status).toBe(500);
			const data = (await res.json()) as any;
			expect(data.error).toMatch(/not configured/i);
			expect(sanity.createOrder).not.toHaveBeenCalled();
			expect(email.sendEmail).not.toHaveBeenCalled();
		});
	});
});

describe('GET /orders/:ref?email=…', () => {
	beforeEach(() => {
		vi.mocked(sanity.getOrderByRef).mockReset();
	});

	it('returns a sanitised order when the email matches', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({
				customerEmail: 'jane@example.com',
				customerPhone: '0123456789',
				shippingAddress: '1 Test St',
				trackingNumber: 'CG123',
				shippingCarrier: 'Courier Guy'
			})
		);

		const app = createApp();
		const res = await app.request(
			'/orders/MG-260410-ABCD?email=jane%40example.com'
		);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.ref).toBe('MG-260410-ABCD');
		expect(data.status).toBe('pending_payment');
		expect(data.customerName).toBe('Jane Smith');
		expect(data.shipping).toEqual({
			carrier: 'Courier Guy',
			trackingNumber: 'CG123',
			trackingUrl: null
		});
		expect(data.customerPhone).toBeUndefined();
		expect(data.shippingAddress).toBeUndefined();
	});

	it('is case-insensitive on the email parameter', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ customerEmail: 'Jane@Example.com' })
		);
		const app = createApp();
		const res = await app.request(
			'/orders/MG-260410-ABCD?email=JANE%40EXAMPLE.COM'
		);
		expect(res.status).toBe(200);
	});

	it('returns 404 when the order reference is not found', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(null);
		const app = createApp();
		const res = await app.request(
			'/orders/MG-000000-XXXX?email=jane%40example.com'
		);
		expect(res.status).toBe(404);
	});

	it('returns 404 (not 403) when the email does not match', async () => {
		// Security: same response as not-found so attackers can't distinguish
		// "real ref + wrong email" from "fake ref".
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ customerEmail: 'real@example.com' })
		);
		const app = createApp();
		const res = await app.request(
			'/orders/MG-260410-ABCD?email=attacker%40example.com'
		);
		expect(res.status).toBe(404);
	});

	it('returns 404 when the email param is missing entirely', async () => {
		const app = createApp();
		const res = await app.request('/orders/MG-260410-ABCD');
		expect(res.status).toBe(404);
		expect(sanity.getOrderByRef).not.toHaveBeenCalled();
	});

	it('returns 500 if Sanity throws during lookup', async () => {
		vi.mocked(sanity.getOrderByRef).mockRejectedValueOnce(new Error('sanity down'));
		const app = createApp();
		const res = await app.request(
			'/orders/MG-260410-ABCD?email=jane%40example.com'
		);
		expect(res.status).toBe(500);
	});

	it('returns null shipping info when the order has none', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({
				customerEmail: 'jane@example.com',
				trackingNumber: null,
				trackingUrl: null,
				shippingCarrier: null
			})
		);
		const app = createApp();
		const res = await app.request(
			'/orders/MG-260410-ABCD?email=jane%40example.com'
		);
		const data = (await res.json()) as any;
		expect(data.shipping).toBeNull();
	});
});

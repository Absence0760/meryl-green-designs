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
	getGalleryPhotos: vi.fn(),
	getProductsByIds: vi.fn(),
	updateOrderPayment: vi.fn()
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

const testProduct = {
	_id: 'prod-1',
	name: 'Small Screen',
	slug: 'small-screen',
	blurb: null,
	description: null,
	priceZar: 450,
	available: true,
	order: 0,
	photos: []
};

const validOrderBody = {
	name: 'Jane Smith',
	email: 'jane@example.com',
	phone: '0123456789',
	address: '1 Test Street\nCape Town',
	notes: 'Please gift wrap',
	cart: [{ productId: 'prod-1', quantity: 1 }]
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
		vi.stubEnv('PAYFAST_MERCHANT_ID', '10004002');
		vi.stubEnv('PAYFAST_MERCHANT_KEY', 'q1cd2rdny4a53');
		vi.stubEnv('PAYFAST_PASSPHRASE', 'payfast');
		vi.stubEnv('PAYFAST_SANDBOX', 'true');
		vi.mocked(email.sendEmail).mockClear().mockResolvedValue(undefined);
		vi.mocked(sanity.createOrder).mockClear().mockResolvedValue(
			sanityOrder({ paymentMethod: 'payfast', amountZar: 450 })
		);
		vi.mocked(sanity.getProductsByIds).mockReset().mockResolvedValue([testProduct]);
	});

	afterEach(() => vi.unstubAllEnvs());

	it('creates a Sanity order and returns PayFast form data', async () => {
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.success).toBe(true);
		expect(data.ref).toMatch(/^MG-\d{6}-[A-Z0-9]{4}$/);
		expect(data.payfast).toBeDefined();
		expect(data.payfast.action).toContain('sandbox.payfast.co.za');
		expect(data.payfast.fields.amount).toBe('450.00');
		expect(data.payfast.fields.signature).toMatch(/^[a-f0-9]{32}$/);
		expect(sanity.createOrder).toHaveBeenCalledOnce();

		const createArg = vi.mocked(sanity.createOrder).mock.calls[0]![0];
		expect(createArg.customerName).toBe('Jane Smith');
		expect(createArg.customerEmail).toBe('jane@example.com');
		expect(createArg.paymentMethod).toBe('payfast');
		expect(createArg.amountZar).toBe(450);
	});

	it('sends only the owner notification email (customer email comes after payment)', async () => {
		await postOrder(validOrderBody);
		expect(email.sendEmail).toHaveBeenCalledTimes(1);
		const send = vi.mocked(email.sendEmail).mock.calls[0]![0];
		expect(send.to).toBe('owner@example.com');
		expect(send.replyTo).toBe('jane@example.com');
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
			{ field: 'empty cart', body: { ...validOrderBody, cart: [] }, message: /product/i },
			{
				field: 'name length',
				body: { ...validOrderBody, name: 'x'.repeat(121) },
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

	it('computes total from multiple cart items', async () => {
		const product2 = { ...testProduct, _id: 'prod-2', name: 'Large Screen', priceZar: 900 };
		vi.mocked(sanity.getProductsByIds).mockResolvedValueOnce([testProduct, product2]);
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(
			sanityOrder({ paymentMethod: 'payfast', amountZar: 1800 })
		);

		const res = await postOrder({
			...validOrderBody,
			cart: [
				{ productId: 'prod-1', quantity: 2 },
				{ productId: 'prod-2', quantity: 1 }
			]
		});
		const data = (await res.json()) as any;
		expect(data.payfast.fields.amount).toBe('1800.00');
	});

	it('rejects an order when a product is not found in Sanity', async () => {
		vi.mocked(sanity.getProductsByIds).mockResolvedValueOnce([]);
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(400);
		const data = (await res.json()) as any;
		expect(data.error).toContain('not available');
	});

	it('rejects an order when a product has no price', async () => {
		vi.mocked(sanity.getProductsByIds).mockResolvedValueOnce([
			{ ...testProduct, priceZar: null }
		]);
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(400);
		const data = (await res.json()) as any;
		expect(data.error).toContain('does not have a price');
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

	it('returns 500 when OWNER_EMAIL is not configured', async () => {
		vi.stubEnv('OWNER_EMAIL', '');
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(500);
		const data = (await res.json()) as any;
		expect(data.error).toMatch(/not configured/i);
		expect(sanity.createOrder).not.toHaveBeenCalled();
	});

	it('returns 500 when PayFast config is missing', async () => {
		vi.stubEnv('PAYFAST_MERCHANT_ID', '');
		const res = await postOrder(validOrderBody);
		expect(res.status).toBe(500);
		const data = (await res.json()) as any;
		expect(data.error).toMatch(/not configured/i);
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSignature } from '../payfast.js';
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
import * as sanity from '../sanity.js';

const PASSPHRASE = 'test-passphrase';

function sanityOrder(overrides: Partial<SanityOrder> = {}): SanityOrder {
	return {
		_id: 'order-1',
		_type: 'order',
		_createdAt: '2026-04-13T12:00:00Z',
		_updatedAt: '2026-04-13T12:00:00Z',
		orderRef: 'MG-260413-AB12',
		status: 'pending_payment',
		paymentMethod: 'payfast',
		amountZar: 450,
		paymentId: null,
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: null,
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen — R 450',
		customerNotes: null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		...overrides
	};
}

function buildItnBody(overrides: Record<string, string> = {}): Record<string, string> {
	const body: Record<string, string> = {
		m_payment_id: 'MG-260413-AB12',
		pf_payment_id: '1234567',
		payment_status: 'COMPLETE',
		item_name: 'Meryl Green Designs order MG-260413-AB12',
		amount_gross: '450.00',
		amount_fee: '-14.40',
		amount_net: '435.60',
		merchant_id: '10004002',
		...overrides
	};
	body.signature = generateSignature(body, PASSPHRASE);
	return body;
}

function urlEncode(data: Record<string, string>): string {
	return new URLSearchParams(data).toString();
}

function postItn(body: string) {
	const app = createApp();
	return app.request('/webhooks/payfast-itn', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});
}

describe('POST /webhooks/payfast-itn', () => {
	beforeEach(() => {
		vi.stubEnv('PAYFAST_PASSPHRASE', PASSPHRASE);
		vi.mocked(sanity.getOrderByRef).mockReset();
		vi.mocked(sanity.updateOrderPayment).mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns 500 when PAYFAST_PASSPHRASE is not configured', async () => {
		vi.stubEnv('PAYFAST_PASSPHRASE', '');
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(500);
	});

	it('updates order to payment_received on a valid COMPLETE ITN', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		vi.mocked(sanity.updateOrderPayment).mockResolvedValueOnce(
			sanityOrder({ status: 'payment_received', paymentId: '1234567' })
		);

		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).toHaveBeenCalledWith('MG-260413-AB12', {
			status: 'payment_received',
			paymentId: '1234567'
		});
	});

	it('returns 200 but does not update for invalid signature', async () => {
		const body = buildItnBody();
		body.signature = 'badbadbadbadbadbadbadbadbadbadba';
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(sanity.getOrderByRef).not.toHaveBeenCalled();
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update for non-COMPLETE status', async () => {
		const body = buildItnBody({ payment_status: 'CANCELLED' });
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update when order is not found', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(null);
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update when order already past pending_payment', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ status: 'payment_received' })
		);
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update when amount mismatches', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ amountZar: 999 })
		);
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 when m_payment_id is missing', async () => {
		const body = buildItnBody({ m_payment_id: '' });
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 when Sanity lookup throws', async () => {
		vi.mocked(sanity.getOrderByRef).mockRejectedValueOnce(new Error('sanity down'));
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(sanity.updateOrderPayment).not.toHaveBeenCalled();
	});

	it('returns 200 when Sanity update throws', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		vi.mocked(sanity.updateOrderPayment).mockRejectedValueOnce(new Error('patch failed'));
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
	});
});

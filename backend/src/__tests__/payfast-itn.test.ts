import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSignature } from '../payfast.js';
import type { Order } from "../orders-store.js";

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
vi.mock('../orders-store.js', () => ({
	createOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	updateOrderStatus: vi.fn(),
	updateOrderTracking: vi.fn(),
	updateOrderInternalNotes: vi.fn()
}));

import { createApp } from '../app.js';
import * as ordersStore from '../orders-store.js';
import * as email from '../email.js';

const PASSPHRASE = 'test-passphrase';

// Phase 1: the ITN route goes through ordersStore (the split-store
// abstraction) rather than reading Sanity directly. ordersStore's
// getOrderByRef returns the joined Order (Sanity skeleton + DynamoDB
// PII). For ITN-side assertions, the route only inspects `status` and
// `amountZar` (both non-PII, both from the Sanity half of the join), so
// the fixture can stay slim — but it must be typed as Order rather than
// SanityOrder because that's what ordersStore promises.
function sanityOrder(overrides: Partial<Order> = {}): Order {
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
		// PII fields filled with placeholder values to satisfy the Order
		// shape contract — the ITN route never reads any of these, but
		// the joined type requires them all to be present. The email
		// uses the RFC 5321 invalid TLD `.invalid` so a literal search
		// for this address in production logs / databases is guaranteed
		// to be a test artefact, never a real customer.
		customerName: 'Test Customer',
		customerEmail: 'itn-test-placeholder@invalid',
		customerPhone: null,
		shippingAddress: '1 Test Street',
		items: '1 x Test product',
		customerNotes: null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		internalNotes: null,
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
		vi.mocked(ordersStore.getOrderByRef).mockReset();
		vi.mocked(ordersStore.updateOrderStatus).mockReset();
		vi.mocked(email.sendEmail).mockReset();
		vi.mocked(email.sendEmail).mockResolvedValue(undefined);
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
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		vi.mocked(ordersStore.updateOrderStatus).mockResolvedValueOnce(
			sanityOrder({ status: 'payment_received', paymentId: '1234567' })
		);

		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).toHaveBeenCalledWith('MG-260413-AB12', {
			status: 'payment_received',
			paymentId: '1234567'
		});
	});

	it('returns 200 but does not update for invalid signature', async () => {
		const body = buildItnBody();
		body.signature = 'badbadbadbadbadbadbadbadbadbadba';
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(ordersStore.getOrderByRef).not.toHaveBeenCalled();
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update for non-COMPLETE status', async () => {
		// Order is loaded so we can decide whether to send a
		// failed-payment email; on FAILED + pending we fire one.
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		const body = buildItnBody({ payment_status: 'CANCELLED' });
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
		// FAILED + still-pending: customer gets a "didn't go through"
		// email with retry guidance (docs/payment-retry-plan.md Option A).
		expect(email.sendEmail).toHaveBeenCalledOnce();
		const arg = vi.mocked(email.sendEmail).mock.calls[0]![0];
		expect(arg.to).toBe('itn-test-placeholder@invalid');
		expect(arg.subject).toContain("didn't go through");
		expect(arg.subject).toContain('MG-260413-AB12');
	});

	it('does NOT send a failed-payment email on a late non-COMPLETE ITN for an already-paid order', async () => {
		// PayFast retries ITN delivery for up to 24h. If a customer
		// succeeds on retry between the first FAILED ITN and a late
		// duplicate, the duplicate must not surprise them with a
		// "didn't go through" email after they've already been
		// charged. Guarded by the `status === 'pending_payment'`
		// check inside the non-COMPLETE branch.
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ status: 'payment_received' })
		);
		const body = buildItnBody({ payment_status: 'CANCELLED' });
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	it('still acks PayFast 200 if the failed-payment email send throws', async () => {
		// Best-effort: a Resend hiccup must not cause PayFast to
		// re-deliver the ITN (which would retry the email storm).
		// The customer can still retry via /track even without the
		// email.
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		vi.mocked(email.sendEmail).mockRejectedValueOnce(new Error('resend down'));
		const body = buildItnBody({ payment_status: 'CANCELLED' });
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
	});

	it('returns 200 but does not update when order is not found', async () => {
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(null);
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update when order already past pending_payment', async () => {
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ status: 'payment_received' })
		);
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
	});

	it('returns 200 but does not update when amount mismatches', async () => {
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ amountZar: 999 })
		);
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
	});

	it('returns 200 when m_payment_id is missing', async () => {
		const body = buildItnBody({ m_payment_id: '' });
		const res = await postItn(urlEncode(body));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
	});

	it('returns 200 when Sanity lookup throws', async () => {
		vi.mocked(ordersStore.getOrderByRef).mockRejectedValueOnce(new Error('sanity down'));
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderStatus).not.toHaveBeenCalled();
	});

	it('returns 200 when Sanity update throws', async () => {
		vi.mocked(ordersStore.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		vi.mocked(ordersStore.updateOrderStatus).mockRejectedValueOnce(new Error('patch failed'));
		const res = await postItn(urlEncode(buildItnBody()));
		expect(res.status).toBe(200);
	});
});

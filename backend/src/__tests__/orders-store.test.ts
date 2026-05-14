import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import type { SanityOrder } from '../sanity.js';

vi.mock('../sanity.js', () => ({
	createOrder: vi.fn(),
	deleteOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	updateOrderPayment: vi.fn()
}));

import * as sanity from '../sanity.js';
import * as ordersStore from '../orders-store.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

// Phase 1: Sanity stores only the non-PII skeleton.
function sanityOrder(overrides: Partial<SanityOrder> = {}): SanityOrder {
	return {
		_id: 'order-1',
		_type: 'order',
		_createdAt: '2026-04-10T12:00:00Z',
		_updatedAt: '2026-04-10T12:00:00Z',
		orderRef: 'MG-260410-ABCD',
		status: 'pending_payment',
		paymentMethod: 'payfast',
		amountZar: 450,
		paymentId: null,
		...overrides
	};
}

const newOrderInput = {
	orderRef: 'MG-260410-ABCD',
	customerName: 'Jane Smith',
	customerEmail: 'jane@example.com',
	customerPhone: '0123456789',
	shippingAddress: '1 Test Street',
	items: '1 x Small Screen — R 450.00',
	customerNotes: 'Please gift wrap',
	paymentMethod: 'payfast' as const,
	amountZar: 450
};

describe('ordersStore.createOrder (Phase 1 split-write)', () => {
	beforeEach(() => {
		ddbMock.reset();
		vi.mocked(sanity.createOrder).mockReset();
		vi.mocked(sanity.deleteOrder).mockReset();
	});

	it('writes DynamoDB first, then Sanity — opposite of Phase 0', async () => {
		// Phase 1 ordering matters: PII has to land in DynamoDB before the
		// Sanity skeleton exists, so we never have a Sanity order doc
		// referring to a row that isn't there yet.
		const calls: string[] = [];
		ddbMock.on(PutCommand).callsFake(() => {
			calls.push('dynamo');
			return {};
		});
		vi.mocked(sanity.createOrder).mockImplementation(async () => {
			calls.push('sanity');
			return sanityOrder();
		});

		await ordersStore.createOrder(newOrderInput);

		expect(calls).toEqual(['dynamo', 'sanity']);
	});

	it('returns the joined Order — Sanity skeleton + DynamoDB PII', async () => {
		ddbMock.on(PutCommand).resolves({});
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(
			sanityOrder({ paymentId: null, amountZar: 450 })
		);

		const result = await ordersStore.createOrder(newOrderInput);

		// Non-PII from Sanity
		expect(result.orderRef).toBe('MG-260410-ABCD');
		expect(result.status).toBe('pending_payment');
		expect(result.amountZar).toBe(450);
		expect(result.paymentMethod).toBe('payfast');
		// PII from DynamoDB (built from input)
		expect(result.customerName).toBe('Jane Smith');
		expect(result.customerEmail).toBe('jane@example.com');
		expect(result.items).toBe('1 x Small Screen — R 450.00');
	});

	it('writes a PII row keyed by orderRef with a 365-day TTL', async () => {
		ddbMock.on(PutCommand).resolves({});
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(sanityOrder());

		await ordersStore.createOrder(newOrderInput);

		const putCalls = ddbMock.commandCalls(PutCommand);
		expect(putCalls).toHaveLength(1);
		const item = putCalls[0]!.args[0].input.Item!;
		expect(item.orderRef).toBe('MG-260410-ABCD');
		expect(item.customerEmail).toBe('jane@example.com');
		expect(item.customerName).toBe('Jane Smith');
		expect(item.items).toBe('1 x Small Screen — R 450.00');
		expect(item.trackingNumber).toBeNull();

		// TTL anchored at the createdAt that the test fixture controls. The
		// Phase 1 createOrder uses `new Date()` at call time rather than
		// reading from Sanity's _createdAt (since the Sanity write happens
		// AFTER the DynamoDB write), so just assert the TTL is roughly the
		// expected duration into the future.
		const now = Math.floor(Date.now() / 1000);
		expect(item.ttl).toBeGreaterThan(now + 364 * 24 * 60 * 60);
		expect(item.ttl).toBeLessThan(now + 366 * 24 * 60 * 60);

		// Duplicate guard for retries.
		expect(putCalls[0]!.args[0].input.ConditionExpression).toBe(
			'attribute_not_exists(orderRef)'
		);
	});

	it('only writes the non-PII skeleton to Sanity', async () => {
		ddbMock.on(PutCommand).resolves({});
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(sanityOrder());

		await ordersStore.createOrder(newOrderInput);

		// First positional arg is the doc (non-PII only); the second is
		// the options bag carrying the AbortSignal for the timeout. We
		// assert structurally on the first arg only and accept any
		// options shape.
		expect(sanity.createOrder).toHaveBeenCalledWith(
			{
				orderRef: 'MG-260410-ABCD',
				paymentMethod: 'payfast',
				amountZar: 450
			},
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		// No PII fields slipped into the Sanity call.
		const args = vi.mocked(sanity.createOrder).mock.calls[0]![0];
		expect(args).not.toHaveProperty('customerName');
		expect(args).not.toHaveProperty('customerEmail');
		expect(args).not.toHaveProperty('items');
		expect(args).not.toHaveProperty('shippingAddress');
	});

	it('propagates a Sanity failure AFTER deleting the DynamoDB PII row (compensating action)', async () => {
		ddbMock.on(PutCommand).resolves({});
		ddbMock.on(DeleteCommand).resolves({});
		vi.mocked(sanity.createOrder).mockRejectedValueOnce(new Error('sanity exploded'));

		await expect(ordersStore.createOrder(newOrderInput)).rejects.toThrow('sanity exploded');

		// The DynamoDB PII row was inserted, then deleted as compensation.
		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
		const delCalls = ddbMock.commandCalls(DeleteCommand);
		expect(delCalls).toHaveLength(1);
		expect(delCalls[0]!.args[0].input.Key).toEqual({ orderRef: 'MG-260410-ABCD' });
	});

	it('still throws the Sanity error even when the compensating delete fails', async () => {
		// The orphaned PII row has a 365-day TTL and will expire. The
		// reconciler cron (Day 9+) flags it sooner. We must not swallow the
		// Sanity error just because cleanup failed — the customer's order
		// did not complete.
		ddbMock.on(PutCommand).resolves({});
		ddbMock.on(DeleteCommand).rejects(new Error('delete throttled'));
		vi.mocked(sanity.createOrder).mockRejectedValueOnce(new Error('sanity exploded'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(ordersStore.createOrder(newOrderInput)).rejects.toThrow('sanity exploded');

		// The compensating-delete failure was logged but didn't mask the
		// Sanity error.
		expect(errSpy).toHaveBeenCalledOnce();
		const logged = errSpy.mock.calls[0]![0] as string;
		expect(logged).toContain('Compensating delete failed');
		expect(logged).toContain('MG-260410-ABCD');
		expect(logged).toContain('delete throttled');
		errSpy.mockRestore();
	});

	it('propagates a DynamoDB write failure without ever calling Sanity', async () => {
		// Phase 1 inverts Phase 0: a DynamoDB failure now must fail the
		// customer's order, because Sanity hasn't been touched yet and
		// there's nothing to compensate.
		ddbMock.on(PutCommand).rejects(new Error('throttled'));

		await expect(ordersStore.createOrder(newOrderInput)).rejects.toThrow('throttled');

		expect(sanity.createOrder).not.toHaveBeenCalled();
		expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
	});

	it('coerces empty optional strings to null when writing PII', async () => {
		ddbMock.on(PutCommand).resolves({});
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(sanityOrder());

		await ordersStore.createOrder({
			...newOrderInput,
			customerPhone: '',
			customerNotes: ''
		});

		const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item!;
		expect(item.customerPhone).toBeNull();
		expect(item.customerNotes).toBeNull();
	});
});

describe('ordersStore.getOrderByRef (Phase 1 join)', () => {
	beforeEach(() => {
		ddbMock.reset();
		vi.mocked(sanity.getOrderByRef).mockReset();
	});

	function piiItem() {
		return {
			orderRef: 'MG-260410-ABCD',
			customerName: 'Jane Smith',
			customerEmail: 'jane@example.com',
			customerPhone: '0123456789',
			shippingAddress: '1 Test Street',
			items: '1 x Small Screen — R 450.00',
			customerNotes: null,
			trackingNumber: 'CG-12345',
			trackingUrl: null,
			shippingCarrier: 'Courier Guy',
			internalNotes: null,
			createdAt: '2026-04-10T12:00:00Z',
			ttl: 1234567890
		};
	}

	it('joins Sanity skeleton + DynamoDB PII into a unified Order', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		ddbMock.on(GetCommand).resolves({ Item: piiItem() });

		const result = await ordersStore.getOrderByRef('MG-260410-ABCD');

		expect(result).not.toBeNull();
		expect(result!.orderRef).toBe('MG-260410-ABCD');
		expect(result!.status).toBe('pending_payment');
		expect(result!.amountZar).toBe(450);
		expect(result!.customerName).toBe('Jane Smith');
		expect(result!.customerEmail).toBe('jane@example.com');
		expect(result!.trackingNumber).toBe('CG-12345');
	});

	it('returns null when Sanity has no matching order (orphan PII)', async () => {
		// A DynamoDB row without a Sanity counterpart is an orphan from a
		// failed compensating delete or a manual cleanup mid-flight. The
		// public lookup behaves as a 404 — the reconciler cron flags the
		// orphan for operator attention.
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(null);
		ddbMock.on(GetCommand).resolves({ Item: piiItem() });

		const result = await ordersStore.getOrderByRef('MG-000000-XXXX');
		expect(result).toBeNull();
	});

	it('returns null when DynamoDB has no PII row (skeleton-only)', async () => {
		// A skeleton-only Sanity doc is the symmetric orphan — possible if
		// somebody manually deleted a PII row, or if a TTL fired but the
		// Sanity doc wasn't cleaned. Same null behaviour for the lookup.
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		ddbMock.on(GetCommand).resolves({});

		const result = await ordersStore.getOrderByRef('MG-000000-XXXX');
		expect(result).toBeNull();
	});

	it('returns null when both stores miss', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(null);
		ddbMock.on(GetCommand).resolves({});

		const result = await ordersStore.getOrderByRef('MG-NONEXISTENT');
		expect(result).toBeNull();
	});
});

describe('ordersStore.getOrderPii', () => {
	beforeEach(() => {
		ddbMock.reset();
	});

	it('returns the DynamoDB item for an existing orderRef', async () => {
		const item = {
			orderRef: 'MG-260410-ABCD',
			customerName: 'Jane Smith',
			customerEmail: 'jane@example.com',
			ttl: 123
		};
		ddbMock.on(GetCommand).resolves({ Item: item });

		const result = await ordersStore.getOrderPii('MG-260410-ABCD');

		expect(result).toEqual(item);
		const call = ddbMock.commandCalls(GetCommand)[0]!.args[0].input;
		expect(call.Key).toEqual({ orderRef: 'MG-260410-ABCD' });
	});

	it('returns null when no item exists', async () => {
		ddbMock.on(GetCommand).resolves({});
		const result = await ordersStore.getOrderPii('MG-000000-XXXX');
		expect(result).toBeNull();
	});
});

describe('ordersStore.updateOrderStatus', () => {
	beforeEach(() => {
		ddbMock.reset();
		vi.mocked(sanity.updateOrderPayment).mockReset();
	});

	it('delegates to Sanity and never touches DynamoDB (status is not PII)', async () => {
		const order = sanityOrder({ status: 'payment_received', paymentId: 'pf-123' });
		vi.mocked(sanity.updateOrderPayment).mockResolvedValueOnce(order);

		const result = await ordersStore.updateOrderStatus('MG-260410-ABCD', {
			status: 'payment_received',
			paymentId: 'pf-123'
		});

		expect(result).toEqual(order);
		expect(sanity.updateOrderPayment).toHaveBeenCalledWith('MG-260410-ABCD', {
			status: 'payment_received',
			paymentId: 'pf-123'
		});
		expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
	});
});

describe('ordersStore.updateOrderTracking', () => {
	beforeEach(() => {
		ddbMock.reset();
	});

	it('writes only the fields supplied (sparse update)', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await ordersStore.updateOrderTracking('MG-260410-ABCD', {
			trackingNumber: 'CG-12345',
			shippingCarrier: 'Courier Guy'
		});

		const call = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
		expect(call.Key).toEqual({ orderRef: 'MG-260410-ABCD' });
		expect(call.UpdateExpression).toContain('#trackingNumber = :trackingNumber');
		expect(call.UpdateExpression).toContain('#shippingCarrier = :shippingCarrier');
		expect(call.UpdateExpression).not.toContain('trackingUrl');
		expect(call.ExpressionAttributeValues).toEqual({
			':trackingNumber': 'CG-12345',
			':shippingCarrier': 'Courier Guy'
		});
		expect(call.ConditionExpression).toBe('attribute_exists(orderRef)');
	});

	it('allows clearing a tracking field by passing null', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await ordersStore.updateOrderTracking('MG-260410-ABCD', { trackingNumber: null });

		const call = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
		expect(call.ExpressionAttributeValues).toEqual({ ':trackingNumber': null });
	});

	it('is a no-op when no fields are supplied', async () => {
		await ordersStore.updateOrderTracking('MG-260410-ABCD', {});

		expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
	});
});

describe('ordersStore.updateOrderInternalNotes', () => {
	beforeEach(() => {
		ddbMock.reset();
	});

	it('updates the internalNotes attribute on the existing row', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await ordersStore.updateOrderInternalNotes('MG-260410-ABCD', 'sent reminder 2026-05-01');

		const call = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
		expect(call.Key).toEqual({ orderRef: 'MG-260410-ABCD' });
		expect(call.UpdateExpression).toBe('SET internalNotes = :n');
		expect(call.ExpressionAttributeValues).toEqual({ ':n': 'sent reminder 2026-05-01' });
		expect(call.ConditionExpression).toBe('attribute_exists(orderRef)');
	});
});

// ---------------------------------------------------------------------------
// Self-service payment retry adapter
// ---------------------------------------------------------------------------

function piiRow(overrides: Partial<{ customerEmail: string; createdAt: string }> = {}) {
	return {
		orderRef: 'MG-260410-ABCD',
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: '0123456789',
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen',
		customerNotes: null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		internalNotes: null,
		createdAt: '2026-04-10T12:00:00Z',
		ttl: 1_800_000_000,
		...overrides
	};
}

describe('ordersStore.getOrderForRetry', () => {
	beforeEach(() => {
		ddbMock.reset();
		vi.mocked(sanity.getOrderByRef).mockReset();
	});

	it('returns a model with status, amountZar, createdAt, email and name', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ amountZar: 450, status: 'pending_payment' })
		);
		ddbMock.on(GetCommand).resolves({ Item: piiRow() });

		const model = await ordersStore.getOrderForRetry('MG-260410-ABCD');
		expect(model).toEqual({
			status: 'pending_payment',
			amountZar: 450,
			createdAt: '2026-04-10T12:00:00Z',
			customerEmail: 'jane@example.com',
			customerName: 'Jane Smith'
		});
	});

	it('issues exactly one DynamoDB GetCommand per call (no double-read)', async () => {
		// Audit H-1: earlier version called getOrderByRef (which itself
		// fetches PII) plus a second getOrderPii — burning two reads
		// per retry. Single parallel join means exactly one PII read.
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		ddbMock.on(GetCommand).resolves({ Item: piiRow() });
		await ordersStore.getOrderForRetry('MG-260410-ABCD');
		expect(ddbMock.commandCalls(GetCommand)).toHaveLength(1);
	});

	it('returns null when the Sanity skeleton is missing', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(null);
		ddbMock.on(GetCommand).resolves({ Item: piiRow() });
		const model = await ordersStore.getOrderForRetry('MG-260410-ABCD');
		expect(model).toBeNull();
	});

	it('returns null when the DynamoDB PII row is missing', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(sanityOrder());
		ddbMock.on(GetCommand).resolves({});
		const model = await ordersStore.getOrderForRetry('MG-260410-ABCD');
		expect(model).toBeNull();
	});

	it('returns null when amountZar is null (fail-closed)', async () => {
		// Sanity's schema allows null amountZar. Re-signing a PayFast form
		// with no amount would either be rejected by PayFast or charge $0;
		// either way we don't want it. Fail-closed so the retry route
		// returns 404 instead of producing a broken form.
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ amountZar: null })
		);
		ddbMock.on(GetCommand).resolves({ Item: piiRow() });
		const model = await ordersStore.getOrderForRetry('MG-260410-ABCD');
		expect(model).toBeNull();
	});

	it('prefers the DynamoDB createdAt over Sanity._createdAt for retry-window math', async () => {
		// Both sides carry a creation timestamp. Picking the DynamoDB
		// value is monotonic with respect to PII insertion; Sanity's
		// _createdAt could drift if Sanity's clock skews relative to AWS.
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(
			sanityOrder({ _createdAt: '2026-01-01T00:00:00Z' })
		);
		ddbMock.on(GetCommand).resolves({
			Item: piiRow({ createdAt: '2026-04-10T12:00:00Z' })
		});
		const model = await ordersStore.getOrderForRetry('MG-260410-ABCD');
		expect(model?.createdAt).toBe('2026-04-10T12:00:00Z');
	});
});

describe('ordersStore.incrementRetryAttempt', () => {
	beforeEach(() => {
		ddbMock.reset();
	});

	it('sends an UpdateCommand with an atomic ADD + condition', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await ordersStore.incrementRetryAttempt('MG-260410-ABCD', 5);

		const call = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
		expect(call.Key).toEqual({ orderRef: 'MG-260410-ABCD' });
		expect(call.UpdateExpression).toBe('ADD retryAttempts :one SET lastRetryAt = :now');
		// The cap closes the concurrency window — verified by inspection
		// of the ConditionExpression. The condition only inspects
		// retryAttempts; no `attribute_exists(orderRef)` guard because
		// the route handler ensures the order exists before calling this.
		expect(call.ConditionExpression).toBe(
			'attribute_not_exists(retryAttempts) OR retryAttempts < :max'
		);
		expect(call.ExpressionAttributeValues).toMatchObject({
			':one': 1,
			':max': 5
		});
		expect(typeof call.ExpressionAttributeValues![':now']).toBe('string');
	});

	it('throws RetryLimitExceededError when the cap is hit', async () => {
		const err = new Error('cond fail') as Error & { name: string };
		err.name = 'ConditionalCheckFailedException';
		ddbMock.on(UpdateCommand).rejects(err);

		await expect(
			ordersStore.incrementRetryAttempt('MG-260410-ABCD', 5)
		).rejects.toBeInstanceOf(ordersStore.RetryLimitExceededError);
	});

	it('rethrows non-condition errors as-is so the route logs them', async () => {
		ddbMock.on(UpdateCommand).rejects(new Error('throttled'));

		await expect(
			ordersStore.incrementRetryAttempt('MG-260410-ABCD', 5)
		).rejects.toThrow(/throttled/);
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { SanityOrder } from '../sanity.js';

vi.mock('../sanity.js', () => ({
	createOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	updateOrderPayment: vi.fn()
}));

import * as sanity from '../sanity.js';
import * as ordersStore from '../orders-store.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

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
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: '0123456789',
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen — R 450.00',
		customerNotes: 'Please gift wrap',
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
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

describe('ordersStore.createOrder (Phase 0 dual-write)', () => {
	beforeEach(() => {
		ddbMock.reset();
		vi.mocked(sanity.createOrder).mockReset();
	});

	it('writes Sanity first, then DynamoDB', async () => {
		const order = sanityOrder();
		// Track the call order across the two stores: Sanity should resolve
		// before DynamoDB.send is invoked at all.
		const calls: string[] = [];
		vi.mocked(sanity.createOrder).mockImplementation(async () => {
			calls.push('sanity');
			return order;
		});
		ddbMock.on(PutCommand).callsFake(() => {
			calls.push('dynamo');
			return {};
		});

		await ordersStore.createOrder(newOrderInput);

		expect(calls).toEqual(['sanity', 'dynamo']);
	});

	it('writes a PII row keyed by orderRef with a 365-day TTL', async () => {
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(sanityOrder());
		ddbMock.on(PutCommand).resolves({});

		await ordersStore.createOrder(newOrderInput);

		const putCalls = ddbMock.commandCalls(PutCommand);
		expect(putCalls).toHaveLength(1);
		const item = putCalls[0]!.args[0].input.Item!;
		expect(item.orderRef).toBe('MG-260410-ABCD');
		expect(item.customerEmail).toBe('jane@example.com');
		expect(item.customerName).toBe('Jane Smith');
		expect(item.items).toBe('1 x Small Screen — R 450.00');
		expect(item.trackingNumber).toBeNull();

		const createdAt = Date.parse('2026-04-10T12:00:00Z') / 1000;
		expect(item.ttl).toBe(createdAt + 365 * 24 * 60 * 60);

		// Duplicate guard for retries.
		expect(putCalls[0]!.args[0].input.ConditionExpression).toBe(
			'attribute_not_exists(orderRef)'
		);
	});

	it('returns the Sanity order even when the DynamoDB shadow write fails', async () => {
		// Phase 0 contract: a DynamoDB failure must NOT fail the customer's
		// order. Reads still come from Sanity, so the order is valid.
		const order = sanityOrder();
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(order);
		ddbMock.on(PutCommand).rejects(new Error('throttled'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await ordersStore.createOrder(newOrderInput);

		expect(result).toEqual(order);
		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining('shadow write failed'),
			'MG-260410-ABCD',
			expect.any(Error)
		);
		errSpy.mockRestore();
	});

	it('propagates a Sanity failure without writing to DynamoDB', async () => {
		vi.mocked(sanity.createOrder).mockRejectedValueOnce(new Error('sanity exploded'));

		await expect(ordersStore.createOrder(newOrderInput)).rejects.toThrow('sanity exploded');

		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
	});

	it('coerces empty optional strings to null when writing PII', async () => {
		vi.mocked(sanity.createOrder).mockResolvedValueOnce(sanityOrder());
		ddbMock.on(PutCommand).resolves({});

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

describe('ordersStore.getOrderByRef', () => {
	beforeEach(() => {
		ddbMock.reset();
		vi.mocked(sanity.getOrderByRef).mockReset();
	});

	it('delegates to Sanity in Phase 0 (single source of truth)', async () => {
		const order = sanityOrder();
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(order);

		const result = await ordersStore.getOrderByRef('MG-260410-ABCD');

		expect(result).toEqual(order);
		expect(sanity.getOrderByRef).toHaveBeenCalledWith('MG-260410-ABCD');
		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
	});

	it('returns null when Sanity has no matching order', async () => {
		vi.mocked(sanity.getOrderByRef).mockResolvedValueOnce(null);

		const result = await ordersStore.getOrderByRef('MG-000000-XXXX');

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

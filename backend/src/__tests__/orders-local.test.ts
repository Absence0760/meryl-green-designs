import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

vi.mock('../email.js', async () => {
	const actual = await vi.importActual<typeof import('../email.js')>('../email.js');
	return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createLocalOrder,
	deleteLocalOrder,
	getLocalOrderByRef,
	updateLocalOrderPayment
} from '../orders-local.js';
import {
	createOrder,
	deleteOrder,
	getOrderByRef,
	updateOrderPayment
} from '../sanity.js';
import { createApp } from '../app.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

let dir: string;

beforeEach(() => {
	// Nested path that doesn't exist yet — the store must create it.
	dir = join(mkdtempSync(join(tmpdir(), 'mgd-orders-')), 'nested');
	process.env.CONTENT_BACKEND = 'local';
	process.env.CONTENT_DEV_DIR = dir;
});

afterEach(() => {
	delete process.env.CONTENT_BACKEND;
	delete process.env.CONTENT_DEV_DIR;
	rmSync(join(dir, '..'), { recursive: true, force: true });
});

function storeOnDisk() {
	return JSON.parse(readFileSync(join(dir, 'orders.json'), 'utf8')) as {
		orders: Array<Record<string, unknown>>;
	};
}

describe('local order skeleton store', () => {
	it('creates the file on first write with Sanity-shaped system fields', async () => {
		expect(existsSync(join(dir, 'orders.json'))).toBe(false);
		const order = await createLocalOrder({ orderRef: 'MG-1', amountZar: 1500 });
		expect(order).toMatchObject({
			_type: 'order',
			orderRef: 'MG-1',
			status: 'pending_payment',
			paymentMethod: 'payfast',
			amountZar: 1500,
			paymentId: null
		});
		expect(order._id).toMatch(/^local-order-/);
		expect(Date.parse(order._createdAt)).not.toBeNaN();
		expect(storeOnDisk().orders).toHaveLength(1);
	});

	it('looks up by orderRef and returns null for unknown refs', async () => {
		await createLocalOrder({ orderRef: 'MG-1' });
		expect((await getLocalOrderByRef('MG-1'))?.amountZar).toBeNull();
		expect(await getLocalOrderByRef('MG-404')).toBeNull();
	});

	it('returns null (not an error) when the store file does not exist yet', async () => {
		expect(await getLocalOrderByRef('MG-1')).toBeNull();
	});

	it('patches status and paymentId by orderRef', async () => {
		await createLocalOrder({ orderRef: 'MG-1', amountZar: 10 });
		const patched = await updateLocalOrderPayment('MG-1', {
			status: 'payment_received',
			paymentId: 'pf-123'
		});
		expect(patched).toMatchObject({ status: 'payment_received', paymentId: 'pf-123' });
		expect(storeOnDisk().orders[0]).toMatchObject({ status: 'payment_received', paymentId: 'pf-123' });

		// A later status change without paymentId keeps the stored one.
		await updateLocalOrderPayment('MG-1', { status: 'shipped' });
		expect(await getLocalOrderByRef('MG-1')).toMatchObject({ status: 'shipped', paymentId: 'pf-123' });
	});

	it('throws on an unknown orderRef, like the Sanity implementation', async () => {
		await expect(updateLocalOrderPayment('MG-404', { status: 'cancelled' })).rejects.toThrow(
			'Order MG-404 not found'
		);
	});

	it('deletes by document _id', async () => {
		const a = await createLocalOrder({ orderRef: 'MG-A' });
		await createLocalOrder({ orderRef: 'MG-B' });
		await deleteLocalOrder(a._id);
		expect(await getLocalOrderByRef('MG-A')).toBeNull();
		expect(await getLocalOrderByRef('MG-B')).not.toBeNull();
		// Deleting something that isn't there is a no-op.
		await deleteLocalOrder('nope');
		expect(storeOnDisk().orders).toHaveLength(1);
	});

	it('does not lose writes under concurrent creates, and leaves no temp files', async () => {
		await Promise.all(
			Array.from({ length: 20 }, (_, i) => createLocalOrder({ orderRef: `MG-${i}` }))
		);
		expect(storeOnDisk().orders).toHaveLength(20);
		expect(readdirSync(dir)).toEqual(['orders.json']);
	});

	it('names the file in the error when it is corrupt, and recovers for later calls', async () => {
		await createLocalOrder({ orderRef: 'MG-1' });
		writeFileSync(join(dir, 'orders.json'), '{not json');
		await expect(getLocalOrderByRef('MG-1')).rejects.toThrow(/orders\.json is not valid JSON/);
		writeFileSync(join(dir, 'orders.json'), '{"orders":[]}');
		expect(await getLocalOrderByRef('MG-1')).toBeNull();
	});
});

describe('sanity.ts order functions in local mode', () => {
	it('route to the local store with no Sanity config at all', async () => {
		delete process.env.SANITY_PROJECT_ID;
		delete process.env.SANITY_API_TOKEN;
		try {
			const created = await createOrder({ orderRef: 'MG-S', amountZar: 99 });
			expect((await getOrderByRef('MG-S'))?._id).toBe(created._id);
			await updateOrderPayment('MG-S', { status: 'payment_received', paymentId: 'pf-1' });
			expect((await getOrderByRef('MG-S'))?.status).toBe('payment_received');
			await deleteOrder(created._id);
			expect(await getOrderByRef('MG-S')).toBeNull();
		} finally {
			process.env.SANITY_PROJECT_ID = 'test-project';
			process.env.SANITY_API_TOKEN = 'test-sanity-token';
		}
	});
});

describe('POST /orders in local mode', () => {
	it('prices from local content and writes the skeleton to the local store', async () => {
		ddbMock.reset();
		ddbMock.on(PutCommand).resolves({});
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, 'content.json'),
			JSON.stringify({
				products: [
					{
						_id: 'sample-screen',
						name: 'Sample Screen',
						slug: 'sample-screen',
						blurb: null,
						description: null,
						priceZar: 1200,
						dimensions: null,
						available: true,
						order: 0,
						photos: []
					}
				]
			})
		);
		vi.stubEnv('PAYFAST_MERCHANT_ID', '10004002');
		vi.stubEnv('PAYFAST_MERCHANT_KEY', 'q1cd2rdny4a53');
		vi.stubEnv('PAYFAST_PASSPHRASE', 'payfast');
		vi.stubEnv('PAYFAST_SANDBOX', 'true');
		try {
			const res = await createApp().request('/orders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Sample Buyer',
					email: 'buyer@example.com',
					phone: '',
					address: '1 Sample Road',
					notes: '',
					cart: [{ productId: 'sample-screen', quantity: 2 }]
				})
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ref: string; payfast: unknown };
			expect(body.payfast).toBeTruthy();
			const stored = storeOnDisk().orders;
			expect(stored).toHaveLength(1);
			expect(stored[0]).toMatchObject({ orderRef: body.ref, amountZar: 2400, status: 'pending_payment' });
			// PII is not in the local skeleton file — it went to DynamoDB.
			expect(JSON.stringify(stored)).not.toContain('buyer@example.com');
			expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

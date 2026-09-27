import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveLocalDataDir } from './content-local.js';
import type { NewSanityOrderInput, OrderStatus, SanityOrder } from './sanity.js';

// Local-dev stand-in for the Sanity order skeleton. Activated alongside
// the local content backend (CONTENT_BACKEND=local): the order functions
// in sanity.ts delegate here, so checkout works with no Sanity project or
// token. Orders land in <CONTENT_DEV_DIR>/orders.json (default
// backend/.dev-content/orders.json, gitignored). Only the non-PII
// skeleton lives here — the PII half still goes to DynamoDB (LocalStack
// via `pnpm dev:db:up`), exactly as in production.
//
// Semantics mirror the Sanity calls they replace: create sets
// status=pending_payment + system fields, update patches status/paymentId
// by orderRef (throws when unknown), lookup returns null when unknown.
//
// Concurrency: every read-modify-write runs through one in-process queue
// and the file is replaced atomically (write temp + rename), so parallel
// requests to the single dev server can't interleave or leave a torn
// file. Not designed for multiple processes sharing one file.

type OrdersFile = { orders: SanityOrder[] };

export const LOCAL_ORDERS_FILE = 'orders.json';

function ordersPath(): string {
	return resolve(resolveLocalDataDir(), LOCAL_ORDERS_FILE);
}

async function readStore(file: string): Promise<OrdersFile> {
	let raw: string;
	try {
		raw = await readFile(file, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { orders: [] };
		throw err;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<OrdersFile>;
		return { orders: Array.isArray(parsed.orders) ? parsed.orders : [] };
	} catch {
		throw new Error(
			`Local order store ${file} is not valid JSON. Fix it, or delete it to start with no local orders.`
		);
	}
}

async function writeStore(file: string, data: OrdersFile): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(tmp, JSON.stringify(data, null, '\t') + '\n', 'utf8');
	await rename(tmp, file);
}

let queue: Promise<unknown> = Promise.resolve();

// Serialises store access. A failed task doesn't poison the queue for
// the next caller.
function withStore<T>(task: (file: string) => Promise<T>): Promise<T> {
	const run = queue.then(() => task(ordersPath()));
	queue = run.catch(() => undefined);
	return run;
}

export function createLocalOrder(input: NewSanityOrderInput): Promise<SanityOrder> {
	return withStore(async (file) => {
		const store = await readStore(file);
		const now = new Date().toISOString();
		const order: SanityOrder = {
			_id: `local-order-${randomUUID()}`,
			_type: 'order',
			_createdAt: now,
			_updatedAt: now,
			orderRef: input.orderRef,
			status: 'pending_payment',
			paymentMethod: input.paymentMethod ?? 'payfast',
			amountZar: input.amountZar ?? null,
			paymentId: null
		};
		store.orders.push(order);
		await writeStore(file, store);
		return order;
	});
}

export function deleteLocalOrder(orderId: string): Promise<void> {
	return withStore(async (file) => {
		const store = await readStore(file);
		const remaining = store.orders.filter((o) => o._id !== orderId);
		if (remaining.length !== store.orders.length) {
			await writeStore(file, { orders: remaining });
		}
	});
}

export function updateLocalOrderPayment(
	orderRef: string,
	updates: { status: OrderStatus; paymentId?: string }
): Promise<SanityOrder> {
	return withStore(async (file) => {
		const store = await readStore(file);
		const order = store.orders.find((o) => o.orderRef === orderRef);
		if (!order) {
			throw new Error(`Order ${orderRef} not found`);
		}
		order.status = updates.status;
		if (updates.paymentId) order.paymentId = updates.paymentId;
		order._updatedAt = new Date().toISOString();
		await writeStore(file, store);
		return order;
	});
}

export function getLocalOrderByRef(orderRef: string): Promise<SanityOrder | null> {
	return withStore(async (file) => {
		const store = await readStore(file);
		return store.orders.find((o) => o.orderRef === orderRef) ?? null;
	});
}

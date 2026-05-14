// Split-store for order data. Phase 1: DynamoDB holds PII; Sanity holds
// only the order skeleton (orderRef, status, paymentMethod, amountZar,
// paymentId). Callers see a unified `Order` shape — the join is hidden
// in this module. See docs/orders-pii-split-plan.md.
//
// Write order on create is DynamoDB first, then Sanity. If Sanity fails
// after DynamoDB succeeds, the DynamoDB row is removed by a compensating
// delete so we don't end up with PII orphaned from any non-PII record.
// The reverse compensation (Sanity write succeeds, DynamoDB fails) is
// impossible here by construction — DynamoDB writes first.

import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getOrdersTableName } from './dynamo.js';
import {
	createOrder as createSanityOrder,
	deleteOrder as deleteSanityOrder,
	getOrderByRef as getSanityOrderByRef,
	updateOrderPayment as updateSanityOrderPayment,
	type OrderStatus,
	type PaymentMethod,
	type SanityOrder
} from './sanity.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export type OrderPii = {
	orderRef: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string | null;
	shippingAddress: string;
	items: string;
	customerNotes: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shippingCarrier: string | null;
	internalNotes: string | null;
	createdAt: string;
	ttl: number;
};

export type TrackingUpdate = {
	trackingNumber?: string | null;
	trackingUrl?: string | null;
	shippingCarrier?: string | null;
};

// What every caller sees. Same shape as the pre-Phase-1 SanityOrder —
// the join is invisible to them.
export type Order = SanityOrder & {
	customerName: string;
	customerEmail: string;
	customerPhone: string | null;
	shippingAddress: string;
	items: string;
	customerNotes: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shippingCarrier: string | null;
	internalNotes: string | null;
};

export type NewOrderInput = {
	orderRef: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	shippingAddress: string;
	items: string;
	customerNotes: string;
	paymentMethod?: PaymentMethod;
	amountZar?: number;
};

function buildPiiItem(input: NewOrderInput, createdAt: Date): OrderPii {
	return {
		orderRef: input.orderRef,
		customerName: input.customerName,
		customerEmail: input.customerEmail,
		customerPhone: input.customerPhone || null,
		shippingAddress: input.shippingAddress,
		items: input.items,
		customerNotes: input.customerNotes || null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		internalNotes: null,
		createdAt: createdAt.toISOString(),
		ttl: Math.floor(createdAt.getTime() / 1000) + ONE_YEAR_SECONDS
	};
}

function mergeOrder(sanityOrder: SanityOrder, pii: OrderPii): Order {
	return {
		...sanityOrder,
		customerName: pii.customerName,
		customerEmail: pii.customerEmail,
		customerPhone: pii.customerPhone,
		shippingAddress: pii.shippingAddress,
		items: pii.items,
		customerNotes: pii.customerNotes,
		trackingNumber: pii.trackingNumber,
		trackingUrl: pii.trackingUrl,
		shippingCarrier: pii.shippingCarrier,
		internalNotes: pii.internalNotes
	};
}

async function writeOrderPii(item: OrderPii): Promise<void> {
	const client = getDynamoClient();
	await client.send(
		new PutCommand({
			TableName: getOrdersTableName(),
			Item: item,
			// orderRef is server-generated and unique by construction; this
			// guards against accidental retries replacing an existing row.
			ConditionExpression: 'attribute_not_exists(orderRef)'
		})
	);
}

async function deleteOrderPii(orderRef: string): Promise<void> {
	const client = getDynamoClient();
	await client.send(
		new DeleteCommand({
			TableName: getOrdersTableName(),
			Key: { orderRef }
		})
	);
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
	// Phase 1: PII write first so the Sanity document never exists without
	// a matching PII row. If the Sanity create fails afterwards we delete
	// the PII row to keep the two stores in sync.
	const createdAt = new Date();
	const piiItem = buildPiiItem(input, createdAt);

	await writeOrderPii(piiItem);

	let sanityOrder: SanityOrder;
	try {
		sanityOrder = await createSanityOrder({
			orderRef: input.orderRef,
			paymentMethod: input.paymentMethod,
			amountZar: input.amountZar
		});
	} catch (err) {
		try {
			await deleteOrderPii(input.orderRef);
		} catch (delErr) {
			// Best-effort. If the compensating delete fails the orphaned PII
			// row has a 365-day TTL and will expire on its own; the
			// reconciler cron (planned for Day 9) will flag the orphan
			// sooner. Stringify the error rather than passing the raw object
			// so customer values can't end up in CloudWatch by accident.
			const delMessage = delErr instanceof Error ? delErr.message : String(delErr);
			console.error(
				`Compensating delete failed for orphaned PII ${input.orderRef}: ${delMessage}`
			);
		}
		throw err;
	}

	return mergeOrder(sanityOrder, piiItem);
}

export async function getOrderByRef(orderRef: string): Promise<Order | null> {
	// Phase 1: join Sanity (non-PII) with DynamoDB (PII). Parallel reads
	// because they hit independent backends.
	const [sanityOrder, pii] = await Promise.all([
		getSanityOrderByRef(orderRef),
		getOrderPii(orderRef)
	]);
	if (!sanityOrder || !pii) {
		// Either side missing means the row is unreadable as an order. The
		// reconciler cron flags the orphan; callers see a 404 just like an
		// unknown orderRef. Returning null rather than throwing keeps the
		// no-enumeration policy intact on the public /orders/:ref route.
		return null;
	}
	return mergeOrder(sanityOrder, pii);
}

export async function getOrderPii(orderRef: string): Promise<OrderPii | null> {
	// Direct DynamoDB read; bypasses the Sanity-side join. The admin routes
	// that power the Studio's custom PII panels call this directly.
	const client = getDynamoClient();
	const result = await client.send(
		new GetCommand({
			TableName: getOrdersTableName(),
			Key: { orderRef }
		})
	);
	return (result.Item as OrderPii | undefined) ?? null;
}

export async function updateOrderStatus(
	orderRef: string,
	updates: { status: OrderStatus; paymentId?: string }
): Promise<SanityOrder> {
	// Status + paymentId are non-PII; they stay on the Sanity document.
	return updateSanityOrderPayment(orderRef, updates);
}

export async function updateOrderTracking(orderRef: string, tracking: TrackingUpdate): Promise<void> {
	const sets: string[] = [];
	const names: Record<string, string> = {};
	const values: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(tracking)) {
		if (value === undefined) continue;
		sets.push(`#${key} = :${key}`);
		names[`#${key}`] = key;
		values[`:${key}`] = value;
	}
	if (sets.length === 0) return;
	const client = getDynamoClient();
	await client.send(
		new UpdateCommand({
			TableName: getOrdersTableName(),
			Key: { orderRef },
			UpdateExpression: `SET ${sets.join(', ')}`,
			ExpressionAttributeNames: names,
			ExpressionAttributeValues: values,
			ConditionExpression: 'attribute_exists(orderRef)'
		})
	);
}

export async function updateOrderInternalNotes(
	orderRef: string,
	internalNotes: string | null
): Promise<void> {
	const client = getDynamoClient();
	await client.send(
		new UpdateCommand({
			TableName: getOrdersTableName(),
			Key: { orderRef },
			UpdateExpression: 'SET internalNotes = :n',
			ExpressionAttributeValues: { ':n': internalNotes },
			ConditionExpression: 'attribute_exists(orderRef)'
		})
	);
}

// Unused-by-default safety net: re-export the Sanity delete so a future
// cleanup script can call it directly without a fresh import. Kept here
// so it's discoverable alongside the create/delete compensating pair.
export { deleteSanityOrder };

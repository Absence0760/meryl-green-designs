// Split-store for order data. Phase 0 (dual-write) is below: Sanity is the
// source of truth and DynamoDB receives a shadow copy of the PII fields.
// Phase 1 (cutover) inverts this — see docs/orders-pii-split-plan.md.
//
// Read paths still go to Sanity; the join with DynamoDB lands in Phase 1.

import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getOrdersTableName } from './dynamo.js';
import {
	createOrder as createSanityOrder,
	getOrderByRef as getSanityOrderByRef,
	updateOrderPayment as updateSanityOrderPayment,
	type NewOrderInput,
	type OrderStatus,
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

export async function createOrder(input: NewOrderInput): Promise<SanityOrder> {
	// Phase 0: Sanity write is the source of truth. DynamoDB is shadow —
	// a failure there must not fail the customer's order. Phase 1 inverts
	// this (DynamoDB first, Sanity second, compensating delete on failure).
	const sanityOrder = await createSanityOrder(input);
	try {
		await writeOrderPii(buildPiiItem(input, new Date(sanityOrder._createdAt)));
	} catch (err) {
		// Shadow write — log and continue. The reconciler cron (added later)
		// flags orders missing from DynamoDB so we can backfill them.
		console.error('DynamoDB shadow write failed for order', sanityOrder.orderRef, err);
	}
	return sanityOrder;
}

export async function getOrderByRef(orderRef: string): Promise<SanityOrder | null> {
	// Phase 0: Sanity has every field. Phase 1 reads non-PII from Sanity and
	// joins the PII from DynamoDB before returning a unified shape.
	return getSanityOrderByRef(orderRef);
}

export async function getOrderPii(orderRef: string): Promise<OrderPii | null> {
	// Read PII straight from DynamoDB. Used by the admin routes that power
	// the Studio custom panels — they want the DynamoDB view so dual-write
	// parity is observable to the operator during Phase 0.
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
	// Status and paymentId aren't PII — they stay on the Sanity document in
	// both phases. No DynamoDB touch.
	return updateSanityOrderPayment(orderRef, updates);
}

export async function updateOrderTracking(orderRef: string, tracking: TrackingUpdate): Promise<void> {
	// Tracking is PII (courier links typically expose recipient name/address).
	// DynamoDB is the source of truth for tracking even in Phase 0; admin
	// route handlers call this. The Sanity-side native fields stay populated
	// during Phase 0 via Meryl's existing Studio workflow until Phase 1
	// scrubs them.
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

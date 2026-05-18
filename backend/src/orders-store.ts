// Split-store for order data. Phase 1: DynamoDB holds PII; Sanity holds
// only the order skeleton (orderRef, status, paymentMethod, amountZar,
// paymentId). Callers see a unified `Order` shape — the join is hidden
// in this module. See docs/orders-pii-split.md.
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

// Lambda runs with a 30s timeout (infra/lambda.tf). If the Sanity HTTPS
// call hangs (CDN edge, maintenance, slow TLS handshake) until the
// Lambda budget expires, the runtime terminates the invocation
// mid-flight and the compensating-delete catch block never runs — we
// end up with an orphaned PII row in DynamoDB. Bounding the Sanity
// call to 10s gives the catch block at least 20s to issue the
// DeleteCommand even on a worst-case retry.
const SANITY_WRITE_TIMEOUT_MS = 10_000;

// Runs `task(signal)` with a hard timeout. On timeout, the AbortSignal
// is fired so the underlying fetch closes its socket — without this,
// the Sanity SDK's HTTP request would keep running in the background
// inside the Lambda container, holding a socket open until Sanity's
// own server-side timeout. Promise.race alone wins the race for the
// caller but doesn't reach inside the SDK to cancel the work.
async function withTimeout<T>(
	task: (signal: AbortSignal) => Promise<T>,
	ms: number,
	label: string
): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error(`${label} timed out after ${ms}ms`));
		}, ms);
	});
	try {
		return await Promise.race([task(controller.signal), timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

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
	// Last PayFast `pf_payment_id` for which we sent the customer a
	// "didn't go through" email. PayFast retries delivery of a failed
	// ITN for up to 24h — without this marker the retry storm would
	// re-fire the same email each retry. Set by recordFailedItn().
	// `undefined` for rows pre-dating this feature; `null` for new
	// rows that have not yet seen a failed payment.
	lastFailedItnPaymentId?: string | null;
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
	lastFailedItnPaymentId?: string | null;
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
		ttl: Math.floor(createdAt.getTime() / 1000) + ONE_YEAR_SECONDS,
		lastFailedItnPaymentId: null
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
		internalNotes: pii.internalNotes,
		lastFailedItnPaymentId: pii.lastFailedItnPaymentId ?? null
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
		sanityOrder = await withTimeout(
			(signal) =>
				createSanityOrder(
					{
						orderRef: input.orderRef,
						paymentMethod: input.paymentMethod,
						amountZar: input.amountZar
					},
					{ signal }
				),
			SANITY_WRITE_TIMEOUT_MS,
			'Sanity createOrder'
		);
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

// ----------------------------------------------------------------------------
// Self-service payment retry
//
// `getOrderForRetry` is the *only* read path the retry handler should use.
// It returns the minimal set of fields needed for the 12-step fail-closed
// flow in docs/payment-retry.md and ensures the field names match
// across Phase 0 (Sanity-only) and Phase 1 (Sanity skeleton + DynamoDB PII).
//
// In Phase 1, Sanity exposes `_createdAt` (with underscore — the Sanity
// system field) and DynamoDB stores `createdAt` (no underscore, set by
// buildPiiItem). The DynamoDB value is the canonical one for retry-window
// math because it's set at order creation by orders-store and never
// touched after; the Sanity `_createdAt` is a sibling that says the same
// thing. We pick the DynamoDB value to avoid two-source ambiguity.
// ----------------------------------------------------------------------------

export type RetryReadModel = {
	status: OrderStatus;
	amountZar: number;
	createdAt: string;
	customerEmail: string;
	// First-name + last-name source for the re-signed PayFast form.
	// Without this, the retry handler would have to substitute an
	// empty string, which `buildPaymentFormData` puts into the form
	// fields as `name_first=""` but excludes from the signature —
	// PayFast may reject the signature mismatch (see audit M-3).
	customerName: string;
};

export async function getOrderForRetry(orderRef: string): Promise<RetryReadModel | null> {
	// Direct parallel join. Earlier versions called `getOrderByRef()`
	// (which itself fetches both halves) AND a second `getOrderPii()`,
	// duplicating the DynamoDB read on every retry. Reading both
	// halves here once is identical in latency to `getOrderByRef`
	// alone, and avoids the wasted read unit. See audit H-1.
	const [sanityOrder, pii] = await Promise.all([
		getSanityOrderByRef(orderRef),
		getOrderPii(orderRef)
	]);
	if (!sanityOrder || !pii) return null;
	// Fail-closed if the stored `amountZar` is null. The Sanity
	// schema allows it; re-signing a PayFast form with no amount
	// would either be rejected by PayFast or (worse) accepted as
	// zero. Surfacing 404 here flags this as upstream data corruption
	// rather than silently producing a broken payment form.
	if (sanityOrder.amountZar == null) return null;
	return {
		status: sanityOrder.status,
		amountZar: sanityOrder.amountZar,
		// Both halves of the join carry the order's creation time. The
		// DynamoDB `createdAt` was set by `buildPiiItem` at the same
		// instant as the Sanity write, so it's a faithful proxy for
		// "when the order existed". Picking it (not `_createdAt`)
		// keeps the retry-window math monotonic if Sanity's clock
		// skews relative to AWS.
		createdAt: pii.createdAt,
		customerEmail: pii.customerEmail,
		customerName: pii.customerName
	};
}

/**
 * Atomic per-orderRef retry counter. Increments `retryAttempts` by one
 * on the DynamoDB order row, gated by a `ConditionExpression` that
 * caps lifetime attempts at `max` (default 5 — see
 * docs/payment-retry.md § Per-orderRef rate limit for the
 * lifetime-vs-sliding-window rationale).
 *
 * Throws when the cap is exceeded (the DynamoDB SDK throws
 * `ConditionalCheckFailedException`; we re-throw a typed error so the
 * route handler can distinguish "rate limit" from "DynamoDB down").
 *
 * `lastRetryAt` is written for operator visibility (Meryl can see when
 * the customer last tried), not for the enforcement logic. The
 * condition only inspects `retryAttempts`.
 */
export class RetryLimitExceededError extends Error {
	constructor(public readonly orderRef: string) {
		super(`Retry limit exceeded for ${orderRef}`);
		this.name = 'RetryLimitExceededError';
	}
}

export async function incrementRetryAttempt(
	orderRef: string,
	max: number
): Promise<void> {
	const client = getDynamoClient();
	try {
		await client.send(
			new UpdateCommand({
				TableName: getOrdersTableName(),
				Key: { orderRef },
				UpdateExpression: 'ADD retryAttempts :one SET lastRetryAt = :now',
				// The condition closes the TOCTOU window: two concurrent
				// requests both attempt the update, but only the one whose
				// pre-update `retryAttempts` value still satisfies the cap
				// succeeds. The other gets ConditionalCheckFailedException.
				ConditionExpression:
					'attribute_not_exists(retryAttempts) OR retryAttempts < :max',
				ExpressionAttributeValues: {
					':one': 1,
					':max': max,
					':now': new Date().toISOString()
				}
			})
		);
	} catch (err: unknown) {
		// AWS SDK v3 surfaces ConditionalCheckFailedException as a typed
		// error whose `.name` carries the expected string. Re-throw a
		// domain-specific error so the route handler can map it to 429
		// without sniffing AWS-internal names.
		const name = (err as { name?: string })?.name;
		if (name === 'ConditionalCheckFailedException') {
			throw new RetryLimitExceededError(orderRef);
		}
		throw err;
	}
}

/**
 * Idempotency marker for the failed-payment email path. The PayFast
 * ITN handler calls this after sending the "didn't go through" email
 * for a given `pf_payment_id`; subsequent retries of the same ITN
 * read the marker via the existing order load and skip re-sending.
 *
 * `attribute_exists(orderRef)` keeps this write tied to a real PII
 * row — phantom-row protection consistent with the rest of the file.
 */
export async function recordFailedItn(
	orderRef: string,
	pfPaymentId: string
): Promise<void> {
	const client = getDynamoClient();
	await client.send(
		new UpdateCommand({
			TableName: getOrdersTableName(),
			Key: { orderRef },
			UpdateExpression: 'SET lastFailedItnPaymentId = :pid',
			ExpressionAttributeValues: { ':pid': pfPaymentId },
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

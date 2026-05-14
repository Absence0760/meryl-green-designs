// Daily sweep that cancels orders left in `pending_payment` for longer than
// AUTO_CANCEL_DAYS (default 30). Honors the commitment in /privacy that
// abandoned checkouts get a terminal state instead of lingering in
// `pending_payment` forever.
//
// Side effects on cancel:
//   - Sanity patch flips status → cancelled. That patch trips the Sanity
//     webhook (filter: `_type == "order" && delta::changedAny(status)`),
//     which in turn fires the existing cancelledTemplate email to the
//     customer. The webhook handler joins DynamoDB to recover the email
//     address — no PII needs to flow through this Lambda.
//   - DynamoDB PII is untouched. Its TTL (365 days from createdAt, set in
//     orders-store.ts:buildPiiItem) continues to govern PII retention.
//
// Idempotent: re-running on the same day finds nothing new because every
// stale order has already been moved out of `pending_payment`.
//
// Entry point for AWS Lambda lives in auto-cancel-lambda.ts; this module
// is import-safe for tests (Sanity client is injectable).

import { createClient, type SanityClient } from '@sanity/client';

export type StalePendingOrder = {
	_id: string;
	orderRef: string;
	_createdAt: string;
};

export type AutoCancelResult = {
	cutoffIso: string;
	found: number;
	cancelled: number;
	failed: number;
};

const DEFAULT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getCutoffIso(now: Date, days: number): string {
	return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

export async function findStalePendingOrders(
	client: SanityClient,
	cutoffIso: string
): Promise<StalePendingOrder[]> {
	// Sanity-managed `_createdAt` is set on create and never edited, so it's
	// the right field for "how long has this order existed?". orderRef and
	// _id are projected so the caller can both log a human-friendly ID and
	// patch by document ID without a second round-trip.
	const query = `*[_type == "order" && status == "pending_payment" && _createdAt < $cutoff] {
		_id,
		orderRef,
		_createdAt
	}`;
	return client.fetch<StalePendingOrder[]>(query, { cutoff: cutoffIso });
}

export async function cancelOrder(client: SanityClient, docId: string): Promise<void> {
	await client.patch(docId).set({ status: 'cancelled' }).commit();
}

export type AutoCancelOptions = {
	client?: SanityClient;
	now?: Date;
	days?: number;
};

export async function autoCancelStaleOrders(
	opts: AutoCancelOptions = {}
): Promise<AutoCancelResult> {
	const client = opts.client ?? buildClientFromEnv();
	const now = opts.now ?? new Date();
	const days = opts.days ?? readDaysFromEnv();
	const cutoffIso = getCutoffIso(now, days);

	const stale = await findStalePendingOrders(client, cutoffIso);
	let cancelled = 0;
	let failed = 0;

	for (const order of stale) {
		try {
			await cancelOrder(client, order._id);
			cancelled++;
			console.log(
				`auto-cancel: cancelled ${order.orderRef} (created ${order._createdAt})`
			);
		} catch (err) {
			failed++;
			// Match the err.message-only convention used elsewhere
			// (orders-store.ts, sanity-webhook.ts) so customer data
			// embedded in an SDK error message doesn't reach CloudWatch.
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`auto-cancel: failed to cancel ${order.orderRef}: ${msg}`);
		}
	}

	return { cutoffIso, found: stale.length, cancelled, failed };
}

function readDaysFromEnv(): number {
	const raw = process.env.AUTO_CANCEL_DAYS;
	if (!raw) return DEFAULT_DAYS;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
	return parsed;
}

function buildClientFromEnv(): SanityClient {
	const projectId = process.env.SANITY_PROJECT_ID;
	const dataset = process.env.SANITY_DATASET ?? 'production';
	const token = process.env.SANITY_API_TOKEN;
	if (!projectId) throw new Error('SANITY_PROJECT_ID is not configured.');
	if (!token) throw new Error('SANITY_API_TOKEN is not configured.');
	return createClient({
		projectId,
		dataset,
		apiVersion: '2024-10-01',
		// useCdn=false on the write path. The CDN's few-second staleness
		// window is acceptable for read queries but would let a recently
		// paid order (status=payment_received) still appear as
		// pending_payment in this query, which would then be cancelled.
		useCdn: false,
		token,
		perspective: 'published'
	});
}

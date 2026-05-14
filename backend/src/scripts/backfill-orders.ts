// One-shot backfill: copy every existing Sanity order document into
// DynamoDB so Phase 0 dual-write parity covers orders that predate the
// dual-write deploy. Idempotent — re-running skips rows that are already
// present.
//
// **Phase 1 note:** after the Day 8 cutover, the Sanity order document
// no longer holds PII (the scrub-sanity-pii.ts script nulls those
// fields). Running this backfill post-cutover would therefore write
// rows with mostly-empty PII into DynamoDB — not useful in steady
// state. The script is preserved as an archival/audit tool for
// historical Phase 0 backfills and as a debugging aid; in normal
// Phase 1 operations there is nothing to backfill because
// orders-store.ts writes the DynamoDB row at order-creation time.
//
// Run from backend/ with
//   pnpm backfill:orders [--dry-run] [--overwrite] [--prod]
//
// Reads `backend/.env` for SANITY_* and ORDERS_TABLE_NAME / DYNAMODB_
// ENDPOINT (the same env that drives the live backend), so by default a
// local run writes to the docker-compose container, not prod AWS — see
// docs/orders-pii-split-plan.md § Implementation sequencing.
//
// Safety gates:
//   --dry-run    No writes, just reports what would happen.
//   --prod       Required when DYNAMODB_ENDPOINT is unset (= real AWS)
//                and --dry-run is not set; refuses to run otherwise.
//                Forces the operator to acknowledge they are targeting
//                production rather than letting an unset env var
//                silently promote a local-looking command into a prod
//                write.
//
// ORDERS_TABLE_NAME is currently identical between local and prod (both
// `meryl-green-designs-orders`). If that ever diverges, lean on the
// startup banner output to confirm you're aimed at the right table —
// there's no automated cross-check.

import { config as loadDotenv } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createClient, type SanityClient } from '@sanity/client';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getOrdersTableName } from '../dynamo.js';
import type { OrderPii } from '../orders-store.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// Matches the Phase-0-era field set on the Sanity order schema. PII
// fields are optional because (a) the pre-Phase-1 pii-cleanup job may
// have null-ed them on terminal orders past 365 days, and (b) the
// Phase-1 scrub script nulls every PII field on every order doc. The
// script's logic predates Phase 1 — empty strings are the deliberate
// "no PII to copy" sentinel.
type SanityOrderForBackfill = {
	_id: string;
	_createdAt: string;
	orderRef: string;
	customerName: string | null;
	customerEmail: string | null;
	customerPhone: string | null;
	shippingAddress: string | null;
	items: string | null;
	customerNotes: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shippingCarrier: string | null;
	internalNotes: string | null;
};

export function piiItemFromSanity(order: SanityOrderForBackfill): OrderPii {
	const createdAtMs = Date.parse(order._createdAt);
	if (!Number.isFinite(createdAtMs)) {
		throw new Error(`Order ${order.orderRef} has invalid _createdAt: ${order._createdAt}`);
	}
	return {
		orderRef: order.orderRef,
		// Empty-string fallback for required-on-the-DynamoDB-shape fields
		// that may have been scrubbed by either the old pii-cleanup
		// (Phase 0) or the Phase-1 scrub script. Empty is correct here —
		// the row exists for join-key purposes; the customer data is
		// gone by design, not by accident.
		customerName: order.customerName ?? '',
		customerEmail: order.customerEmail ?? '',
		customerPhone: order.customerPhone,
		shippingAddress: order.shippingAddress ?? '',
		items: order.items ?? '',
		customerNotes: order.customerNotes,
		trackingNumber: order.trackingNumber,
		trackingUrl: order.trackingUrl,
		shippingCarrier: order.shippingCarrier,
		internalNotes: order.internalNotes,
		createdAt: order._createdAt,
		// TTL matches the prod retention policy in docs/security.md.
		ttl: Math.floor(createdAtMs / 1000) + ONE_YEAR_SECONDS
	};
}

// True when an item's TTL is at or before `nowSec`. Writing such a row
// is pointless — DynamoDB will reap it within ~48h — and misleading,
// because the script's WROTE log would claim a row that quickly vanishes.
export function isExpired(item: OrderPii, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
	return item.ttl <= nowSec;
}

export type Args = { dryRun: boolean; overwrite: boolean; prod: boolean };

export function parseArgs(argv: readonly string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		overwrite: argv.includes('--overwrite'),
		prod: argv.includes('--prod')
	};
}

// Returns a reason string when the script should refuse to write,
// or null when it's safe to proceed. The intent: if you're writing
// (non-dry) against real AWS (no DYNAMODB_ENDPOINT override) you must
// have explicitly passed --prod. Local dev (with DYNAMODB_ENDPOINT set)
// and dry-runs always proceed.
export function shouldRefusePromoting(
	args: Args,
	env: { DYNAMODB_ENDPOINT?: string }
): string | null {
	if (args.dryRun) return null;
	if (env.DYNAMODB_ENDPOINT && env.DYNAMODB_ENDPOINT.trim() !== '') return null;
	if (args.prod) return null;
	return 'DYNAMODB_ENDPOINT is unset (this run would write to real AWS). Pass --prod to confirm, or --dry-run to preview.';
}

function buildSanityClient(): SanityClient {
	const projectId = process.env.SANITY_PROJECT_ID;
	const dataset = process.env.SANITY_DATASET ?? 'production';
	const token = process.env.SANITY_API_TOKEN;
	if (!projectId) throw new Error('SANITY_PROJECT_ID is not set');
	if (!token) throw new Error('SANITY_API_TOKEN is not set');
	return createClient({
		projectId,
		dataset,
		apiVersion: '2024-10-01',
		// Backfills need authoritative reads, not the Fastly cache.
		useCdn: false,
		token,
		perspective: 'published'
	});
}

const ALL_ORDERS_QUERY = `*[_type == "order" && defined(orderRef)] | order(_createdAt asc) {
	_id, _createdAt, orderRef,
	customerName, customerEmail, customerPhone, shippingAddress,
	items, customerNotes, trackingNumber, trackingUrl,
	shippingCarrier, internalNotes
}`;

type Counters = { written: number; skipped: number; expired: number; errors: number };

function isConditionalCheckFailed(err: unknown): boolean {
	return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

async function backfill(args: Args, sanity: SanityClient): Promise<Counters> {
	const dynamo = getDynamoClient();
	const tableName = getOrdersTableName();
	const orders = await sanity.fetch<SanityOrderForBackfill[]>(ALL_ORDERS_QUERY);
	console.log(`Fetched ${orders.length} order(s) from Sanity.`);

	const counts: Counters = { written: 0, skipped: 0, expired: 0, errors: 0 };
	for (const order of orders) {
		try {
			const item = piiItemFromSanity(order);
			if (isExpired(item)) {
				counts.expired++;
				console.log(`  EXPIRED ${order.orderRef} (past retention; not written)`);
				continue;
			}

			if (args.dryRun) {
				// In dry-run we still need to differentiate "would write"
				// from "would skip"; a separate GetItem is fine here because
				// no writes happen and the read is cheap. The race that
				// motivated using a conditional Put on the real path
				// doesn't matter for an advisory preview.
				const existing = await dynamo.send(
					new GetCommand({
						TableName: tableName,
						Key: { orderRef: order.orderRef },
						ProjectionExpression: 'orderRef'
					})
				);
				if (existing.Item && !args.overwrite) {
					counts.skipped++;
					console.log(`  DRY  ${order.orderRef} (would skip — exists)`);
				} else {
					counts.written++;
					console.log(`  DRY  ${order.orderRef} (would write)`);
				}
				continue;
			}

			// Real write: use a conditional Put so the GetItem→PutItem
			// check-then-act race against the live dual-write Lambda
			// collapses into one atomic operation. Without this guard,
			// the backfill could overwrite an order the Lambda just
			// wrote with tracking from Studio.
			try {
				await dynamo.send(
					new PutCommand({
						TableName: tableName,
						Item: item,
						ConditionExpression: args.overwrite
							? undefined
							: 'attribute_not_exists(orderRef)'
					})
				);
				counts.written++;
				console.log(`  WROTE ${order.orderRef}`);
			} catch (err) {
				if (!args.overwrite && isConditionalCheckFailed(err)) {
					counts.skipped++;
					console.log(`  SKIP  ${order.orderRef} (already in DynamoDB)`);
					continue;
				}
				throw err;
			}
		} catch (err) {
			counts.errors++;
			// Defence-in-depth: log err.message rather than the raw Error
			// object (matches orders-store.ts). SDK errors can in theory
			// embed request context; if a future SDK release starts
			// including attribute values in messages, narrow to err.name
			// only. The orderRef itself is not PII.
			const message = err instanceof Error ? err.message : String(err);
			console.error(`  ERROR ${order.orderRef}: ${message}`);
		}
	}
	return counts;
}

async function main(): Promise<void> {
	loadDotenv();
	const args = parseArgs(process.argv.slice(2));

	console.log('--- backfill-orders ---');
	console.log(`  mode: ${args.dryRun ? 'DRY-RUN' : 'WRITE'}`);
	console.log(`  overwrite existing rows: ${args.overwrite}`);
	console.log(`  ORDERS_TABLE_NAME: ${process.env.ORDERS_TABLE_NAME ?? '(unset)'}`);
	console.log(`  DYNAMODB_ENDPOINT: ${process.env.DYNAMODB_ENDPOINT ?? '(unset — real AWS)'}`);
	console.log('');

	const refuseReason = shouldRefusePromoting(args, process.env);
	if (refuseReason) {
		console.error(refuseReason);
		process.exit(1);
	}

	// Once --prod has been acknowledged, opt into real-AWS DynamoDB
	// writes from this non-Lambda process. Without this the dynamo.ts
	// startup assertion refuses to construct the client.
	if (args.prod && !process.env.DYNAMODB_ENDPOINT?.trim()) {
		process.env.ALLOW_REAL_AWS = '1';
	}

	const sanity = buildSanityClient();
	const counts = await backfill(args, sanity);

	console.log('---');
	console.log(
		`Done. written=${counts.written} skipped=${counts.skipped} expired=${counts.expired} errors=${counts.errors}`
	);
	if (counts.errors > 0) process.exitCode = 1;
}

// Only invoke main when the file is executed directly (not when imported
// for unit tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error('Backfill failed:', err);
		process.exit(1);
	});
}

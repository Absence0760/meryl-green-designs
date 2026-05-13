// One-shot backfill: copy every existing Sanity order document into
// DynamoDB so Phase 0 dual-write parity covers orders that predate the
// dual-write deploy. Idempotent — re-running skips rows that are already
// present.
//
// Run from backend/ with `pnpm backfill:orders [--dry-run] [--overwrite]`.
// Reads `backend/.env` for SANITY_* and ORDERS_TABLE_NAME / DYNAMODB_
// ENDPOINT (the same env that drives the live backend), so by default a
// local run writes to the docker-compose container, not prod AWS — see
// docs/orders-pii-split-plan.md § Implementation sequencing.
//
// Production run: same script, with `backend/.env` populated from
// terraform.tfvars.sops values (AWS creds via SSO, real DynamoDB
// endpoint = unset).

import { config as loadDotenv } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createClient, type SanityClient } from '@sanity/client';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getOrdersTableName } from '../dynamo.js';
import type { OrderPii } from '../orders-store.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// Matches the field set on the existing Sanity order schema. PII fields
// are optional because pii-cleanup.ts may have already null-ed them out
// on terminal-state orders older than 365 days.
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
		// that may have been scrubbed by pii-cleanup. Empty is correct here
		// — the row exists for join-key purposes; the customer data is
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

type Args = { dryRun: boolean; overwrite: boolean };

export function parseArgs(argv: readonly string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		overwrite: argv.includes('--overwrite')
	};
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

type Counters = { written: number; skipped: number; errors: number };

async function backfill(args: Args, sanity: SanityClient): Promise<Counters> {
	const dynamo = getDynamoClient();
	const tableName = getOrdersTableName();
	const orders = await sanity.fetch<SanityOrderForBackfill[]>(ALL_ORDERS_QUERY);
	console.log(`Fetched ${orders.length} order(s) from Sanity.`);

	const counts: Counters = { written: 0, skipped: 0, errors: 0 };
	for (const order of orders) {
		try {
			if (!args.overwrite) {
				const existing = await dynamo.send(
					new GetCommand({
						TableName: tableName,
						Key: { orderRef: order.orderRef },
						// Only need to know whether the row exists.
						ProjectionExpression: 'orderRef'
					})
				);
				if (existing.Item) {
					counts.skipped++;
					console.log(`  SKIP ${order.orderRef} (already in DynamoDB)`);
					continue;
				}
			}

			const item = piiItemFromSanity(order);
			if (args.dryRun) {
				counts.written++;
				console.log(`  DRY  ${order.orderRef}`);
				continue;
			}

			await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
			counts.written++;
			console.log(`  WROTE ${order.orderRef}`);
		} catch (err) {
			counts.errors++;
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

	const sanity = buildSanityClient();
	const counts = await backfill(args, sanity);

	console.log('---');
	console.log(`Done. written=${counts.written} skipped=${counts.skipped} errors=${counts.errors}`);
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

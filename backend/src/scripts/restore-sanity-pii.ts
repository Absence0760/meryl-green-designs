// Rollback-only: re-import customer PII from DynamoDB back into Sanity
// order documents. Written and tested in Phase 0 so it's available
// without scrambling if Phase 1 (which scrubs PII out of Sanity) has
// to be reversed. Strictly an emergency tool — running it during
// normal operations is a no-op for fully-populated Sanity orders.
//
// Run from backend/ with `pnpm restore:sanity-pii [--dry-run] [--overwrite]`.
// Default behaviour patches only Sanity fields that are currently
// null/empty — safe to re-run, never overwrites operator edits.
// `--overwrite` forces every DynamoDB value into Sanity even if
// Sanity already has a value; only use if you suspect Sanity drift.
//
// Iterates from Sanity (which lists every order) and does GetItem per
// row, mirroring the backfill direction. Avoids dynamodb:Scan so the
// script runs under the same IAM as the Lambda; the trade-off is that
// DynamoDB rows without a Sanity counterpart aren't reached — but those
// are orphans, not data to restore.

import { config as loadDotenv } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createClient, type SanityClient } from '@sanity/client';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getOrdersTableName } from '../dynamo.js';
import type { OrderPii } from '../orders-store.js';

// The Sanity-side fields we know how to restore. Kept symmetric with
// the OrderPii shape in orders-store.ts. orderRef / status / amountZar /
// paymentId aren't on this list because Sanity stays authoritative for
// those in both phases.
const PII_FIELDS = [
	'customerName',
	'customerEmail',
	'customerPhone',
	'shippingAddress',
	'items',
	'customerNotes',
	'trackingNumber',
	'trackingUrl',
	'shippingCarrier',
	'internalNotes'
] as const;

type PiiField = (typeof PII_FIELDS)[number];

type SanityOrderForRestore = {
	_id: string;
	orderRef: string;
} & { [K in PiiField]: string | null };

const ALL_ORDERS_QUERY = `*[_type == "order" && defined(orderRef)] | order(_createdAt asc) {
	_id, orderRef,
	customerName, customerEmail, customerPhone, shippingAddress,
	items, customerNotes, trackingNumber, trackingUrl,
	shippingCarrier, internalNotes
}`;

type Args = { dryRun: boolean; overwrite: boolean };

export function parseArgs(argv: readonly string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		overwrite: argv.includes('--overwrite')
	};
}

// Decide what to write back to the Sanity doc given the DynamoDB PII row
// and the current Sanity state. Returns null when nothing needs to
// change. Empty strings in DynamoDB are the deliberate "scrubbed by
// retention" sentinel from the backfill — never overwrite a Sanity
// value with one, even under --overwrite.
export function buildPatchFromPii(
	pii: OrderPii,
	current: Pick<SanityOrderForRestore, PiiField>,
	overwrite: boolean
): Record<PiiField, string> | null {
	const patch: Partial<Record<PiiField, string>> = {};
	for (const field of PII_FIELDS) {
		const piiVal = pii[field];
		if (piiVal === null || piiVal === '') continue;
		const currentVal = current[field];
		const isCurrentEmpty = currentVal === null || currentVal === '';
		if (!overwrite && !isCurrentEmpty) continue;
		patch[field] = piiVal;
	}
	return Object.keys(patch).length > 0 ? (patch as Record<PiiField, string>) : null;
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
		useCdn: false,
		token,
		perspective: 'published'
	});
}

type Counters = { restored: number; skipped: number; missing: number; errors: number };

async function restore(args: Args, sanity: SanityClient): Promise<Counters> {
	const dynamo = getDynamoClient();
	const tableName = getOrdersTableName();
	const orders = await sanity.fetch<SanityOrderForRestore[]>(ALL_ORDERS_QUERY);
	console.log(`Fetched ${orders.length} order(s) from Sanity.`);

	const counts: Counters = { restored: 0, skipped: 0, missing: 0, errors: 0 };
	for (const order of orders) {
		try {
			const result = await dynamo.send(
				new GetCommand({
					TableName: tableName,
					Key: { orderRef: order.orderRef }
				})
			);
			if (!result.Item) {
				counts.missing++;
				console.log(`  MISSING ${order.orderRef} (no DynamoDB row)`);
				continue;
			}

			const patch = buildPatchFromPii(result.Item as OrderPii, order, args.overwrite);
			if (!patch) {
				counts.skipped++;
				console.log(`  SKIP    ${order.orderRef} (nothing to restore)`);
				continue;
			}

			if (args.dryRun) {
				counts.restored++;
				console.log(
					`  DRY     ${order.orderRef} (would patch ${Object.keys(patch).length} field(s))`
				);
				continue;
			}

			await sanity.patch(order._id).set(patch).commit();
			counts.restored++;
			console.log(
				`  RESTORED ${order.orderRef} (${Object.keys(patch).length} field(s))`
			);
		} catch (err) {
			counts.errors++;
			const message = err instanceof Error ? err.message : String(err);
			console.error(`  ERROR   ${order.orderRef}: ${message}`);
		}
	}
	return counts;
}

async function main(): Promise<void> {
	loadDotenv();
	const args = parseArgs(process.argv.slice(2));

	console.log('--- restore-sanity-pii ---');
	console.log(`  mode: ${args.dryRun ? 'DRY-RUN' : 'WRITE'}`);
	console.log(`  overwrite existing Sanity values: ${args.overwrite}`);
	console.log(`  ORDERS_TABLE_NAME: ${process.env.ORDERS_TABLE_NAME ?? '(unset)'}`);
	console.log(`  DYNAMODB_ENDPOINT: ${process.env.DYNAMODB_ENDPOINT ?? '(unset — real AWS)'}`);
	console.log('');

	const sanity = buildSanityClient();
	const counts = await restore(args, sanity);

	console.log('---');
	console.log(
		`Done. restored=${counts.restored} skipped=${counts.skipped} missing=${counts.missing} errors=${counts.errors}`
	);
	if (counts.errors > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error('Restore failed:', err);
		process.exit(1);
	});
}

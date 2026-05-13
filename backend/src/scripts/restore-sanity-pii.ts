// Rollback-only: re-import customer PII from DynamoDB back into Sanity
// order documents. Written and tested in Phase 0 so it's available
// without scrambling if Phase 1 (which scrubs PII out of Sanity) has
// to be reversed. Strictly an emergency tool — running it during
// normal operations is a no-op for fully-populated Sanity orders.
//
// Run from backend/ with
//   pnpm restore:sanity-pii [--dry-run] [--overwrite --yes] [--prod]
//
// Default behaviour patches only Sanity fields that are currently
// null/empty — safe to re-run, never overwrites operator edits.
//
// Safety gates:
//   --dry-run    No writes, just reports what would happen.
//   --overwrite  Replace non-null Sanity values too. Requires --yes
//                because a mistyped command would clobber every
//                customer-facing PII field Meryl has typed. Sanity
//                history retains the prior revision, so recovery is
//                possible via the Studio "Compare versions" panel —
//                but it's manual work the gate is designed to avoid.
//   --yes        Companion to --overwrite. Ignored otherwise.
//   --prod       Required when DYNAMODB_ENDPOINT is unset and the run
//                is non-dry, so a missing local env var doesn't
//                silently promote a local-looking command into one
//                that reads real-AWS DynamoDB and patches prod Sanity.
//
// TOCTOU note: this script fetches Sanity orders via GROQ and then
// patches them in a separate API call. If Meryl edits the document
// between the fetch and the patch, the patch silently overwrites her
// edit for the fields in the patch object. Acceptable because (a)
// restore is emergency-only and run under supervision, (b) Sanity is
// effectively single-writer, and (c) Sanity history retains prior
// values for recovery.
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

export type Args = {
	dryRun: boolean;
	overwrite: boolean;
	yes: boolean;
	prod: boolean;
};

export function parseArgs(argv: readonly string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		overwrite: argv.includes('--overwrite'),
		yes: argv.includes('--yes'),
		prod: argv.includes('--prod')
	};
}

// Returns a reason string when the script should refuse to write,
// or null when it's safe to proceed.
//
// Unlike backfill-orders.ts (which gates only on DYNAMODB_ENDPOINT
// because its writes target DynamoDB), restore writes to **Sanity**,
// which is a single-dataset prod-only resource regardless of where
// DynamoDB is read from. So every non-dry restore is a prod write
// and must be acknowledged with --prod.
//
// Also requires --yes alongside --overwrite — a guard against
// mistyped commands that would clobber every Sanity PII field.
export function shouldRefuse(args: Args): string | null {
	if (args.dryRun) return null;
	if (args.overwrite && !args.yes) {
		return '--overwrite without --yes refuses to write. Re-run with both flags to confirm you want to clobber existing Sanity values.';
	}
	if (!args.prod) {
		return 'Restore writes to prod Sanity (single-dataset design). Pass --prod to confirm, or --dry-run to preview.';
	}
	return null;
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
			// Defence-in-depth: same convention as orders-store.ts and
			// backfill-orders.ts — log err.message, not the raw Error
			// object. Sanity SDK errors can echo a portion of the
			// rejected document body; if that becomes a PII concern,
			// narrow this to err.name only.
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

	const refuseReason = shouldRefuse(args);
	if (refuseReason) {
		console.error(refuseReason);
		process.exit(1);
	}

	// Once --prod has been acknowledged, opt into real-AWS DynamoDB
	// reads from this non-Lambda process. The dynamo.ts safety
	// assertion otherwise refuses to construct a client that would
	// reach prod, so a developer who runs `pnpm backend dev` with a
	// missing DYNAMODB_ENDPOINT can't accidentally hit the real table.
	if (args.prod && !process.env.DYNAMODB_ENDPOINT?.trim()) {
		process.env.ALLOW_REAL_AWS = '1';
	}

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

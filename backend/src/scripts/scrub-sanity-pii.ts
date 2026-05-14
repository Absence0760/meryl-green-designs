// Phase 1 one-shot: null out the PII fields on every existing Sanity
// order document. Run AFTER the Phase 1 backend + Studio deploys so
// (a) new orders write only non-PII to Sanity from the deploy onward,
// and (b) the Studio's new schema no longer renders the native PII
// fields, so a brief window of "Sanity has PII, Studio doesn't show
// it" is harmless. See docs/orders-pii-split-plan.md § Phase 1.
//
// Run from backend/ with
//   pnpm scrub:sanity-pii [--dry-run] [--prod --yes]
//
// Safety gates:
//   --dry-run    No writes, just reports what would happen.
//   --prod       Required for any non-dry run. Sanity is a single-
//                dataset prod-only resource, so every wet run targets
//                production by definition.
//   --yes        Required alongside --prod to acknowledge the scrub
//                is destructive: existing PII on Sanity docs is set
//                to null. The PII is still safe in DynamoDB (the
//                Phase 0 dual-write already shadowed it there), so a
//                rollback uses restore-sanity-pii.ts.
//
// Sanity history retains the prior revision for ~30 days, so a
// post-scrub mistake is recoverable via the dashboard's "Compare
// versions" panel within that window. Beyond 30 days, only the
// DynamoDB row + restore-sanity-pii.ts is the recovery path.

import { config as loadDotenv } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createClient, type SanityClient } from '@sanity/client';

// The Sanity-side fields removed at Phase 1 cutover. Kept symmetric
// with the OrderPii shape in orders-store.ts and with the PII_FIELDS
// list in restore-sanity-pii.ts. orderRef / status / amountZar /
// paymentMethod / paymentId stay on the Sanity doc.
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

type SanityOrderForScrub = {
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
	prod: boolean;
	yes: boolean;
};

export function parseArgs(argv: readonly string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		prod: argv.includes('--prod'),
		yes: argv.includes('--yes')
	};
}

// Returns a reason string when the script should refuse to write, or
// null when it's safe to proceed. Same shape as
// restore-sanity-pii.ts:shouldRefuse — the script writes to prod
// Sanity, so a non-dry run must carry both --prod and --yes.
export function shouldRefuse(args: Args): string | null {
	if (args.dryRun) return null;
	if (!args.prod) {
		return 'Scrub writes to prod Sanity (single-dataset design). Pass --prod to confirm, or --dry-run to preview.';
	}
	if (!args.yes) {
		return '--prod without --yes refuses to write. Re-run with both flags to confirm you want to null PII on every order doc.';
	}
	return null;
}

// Compute the patch that should be sent for a given Sanity order. Returns
// null when nothing on the doc still needs scrubbing — i.e. every PII
// field is already null. Lets the main loop count skips cleanly and
// avoid wasting API calls on already-clean docs (re-run idempotency).
export function buildScrubPatch(
	order: Pick<SanityOrderForScrub, PiiField>
): Record<PiiField, null> | null {
	const patch: Partial<Record<PiiField, null>> = {};
	let anyToScrub = false;
	for (const field of PII_FIELDS) {
		if (order[field] !== null && order[field] !== undefined) {
			patch[field] = null;
			anyToScrub = true;
		}
	}
	return anyToScrub ? (patch as Record<PiiField, null>) : null;
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

type Counters = { scrubbed: number; skipped: number; errors: number };

async function scrub(args: Args, sanity: SanityClient): Promise<Counters> {
	const orders = await sanity.fetch<SanityOrderForScrub[]>(ALL_ORDERS_QUERY);
	console.log(`Fetched ${orders.length} order(s) from Sanity.`);

	const counts: Counters = { scrubbed: 0, skipped: 0, errors: 0 };
	for (const order of orders) {
		try {
			const patch = buildScrubPatch(order);
			if (!patch) {
				counts.skipped++;
				console.log(`  SKIP    ${order.orderRef} (already scrubbed)`);
				continue;
			}

			if (args.dryRun) {
				counts.scrubbed++;
				console.log(
					`  DRY     ${order.orderRef} (would null ${Object.keys(patch).length} field(s))`
				);
				continue;
			}

			await sanity.patch(order._id).set(patch).commit();
			counts.scrubbed++;
			console.log(
				`  SCRUBBED ${order.orderRef} (${Object.keys(patch).length} field(s))`
			);
		} catch (err) {
			counts.errors++;
			// Defence-in-depth: same convention as orders-store.ts and the
			// other scripts — log err.message, not the raw Error object.
			// Sanity SDK errors can echo a portion of the rejected document
			// body; the message-only path keeps PII out of CloudWatch on
			// the failure path.
			const message = err instanceof Error ? err.message : String(err);
			console.error(`  ERROR   ${order.orderRef}: ${message}`);
		}
	}
	return counts;
}

async function main(): Promise<void> {
	loadDotenv();
	const args = parseArgs(process.argv.slice(2));

	console.log('--- scrub-sanity-pii ---');
	console.log(`  mode: ${args.dryRun ? 'DRY-RUN' : 'WRITE'}`);
	console.log('');

	const refuseReason = shouldRefuse(args);
	if (refuseReason) {
		console.error(refuseReason);
		process.exit(1);
	}

	const sanity = buildSanityClient();
	const counts = await scrub(args, sanity);

	console.log('---');
	console.log(
		`Done. scrubbed=${counts.scrubbed} skipped=${counts.skipped} errors=${counts.errors}`
	);
	if (!args.dryRun && counts.scrubbed > 0) {
		console.log('');
		console.log(
			'Reminder: Sanity retains the pre-scrub document revision in its'
		);
		console.log(
			'history endpoint for ~30 days. Decide whether to explicitly purge'
		);
		console.log(
			'history now (Phase 2 plan downgrade unblocks after the 14-day'
		);
		console.log(
			'observation window) or wait the full 30 days for natural rollover.'
		);
		console.log(
			'See docs/orders-pii-split-plan.md § Phase 1 step 4 for the'
		);
		console.log(
			'history-purge runbook.'
		);
	}
	if (counts.errors > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error('Scrub failed:', err);
		process.exit(1);
	});
}

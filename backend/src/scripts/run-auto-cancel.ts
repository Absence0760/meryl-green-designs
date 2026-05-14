// Standalone tsx entry that invokes the auto-cancel sweep the same way
// EventBridge invokes it in production. Used by the e2e suite
// (playwright/helpers/run-auto-cancel.ts) to exercise the full sweep
// against a seeded test order. The script exits non-zero on failure
// so the calling spec can assert on exit code in addition to output.
//
// Defaults to invoking the Lambda handler (which reads AUTO_CANCEL_DAYS
// from env). For tests that need to cancel orders created moments ago,
// pass `--days 0` to bypass the env-validated production floor of 1.
// The env reader rejects 0/negative deliberately so a misconfigured
// Lambda can't sweep all pending_payment orders at once; the test
// script gets a direct opts.days override path.

import 'dotenv/config';
import { autoCancelStaleOrders } from '../auto-cancel.js';
import { handler } from '../auto-cancel-lambda.js';

function parseDaysArg(argv: string[]): number | undefined {
	const i = argv.indexOf('--days');
	if (i === -1) return undefined;
	const raw = argv[i + 1];
	if (raw === undefined) return undefined;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`--days must be a non-negative integer (got: ${raw})`);
	}
	return parsed;
}

async function main(): Promise<void> {
	const days = parseDaysArg(process.argv.slice(2));
	const result =
		days === undefined
			? await handler()
			: await autoCancelStaleOrders({ days });
	// Bracket the JSON with a unique marker so the e2e helper can pluck
	// it out of mixed stdout (autoCancelStaleOrders emits a per-order
	// `auto-cancel: cancelled ...` log line, and the handler emits its
	// own `auto-cancel: invoked` / `auto-cancel: complete` framing).
	console.log(`__AUTO_CANCEL_RESULT__${JSON.stringify(result)}__END__`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err instanceof Error ? err.stack ?? err.message : String(err));
		process.exit(1);
	});

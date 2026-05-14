// Standalone tsx entry that invokes the auto-cancel Lambda handler the
// same way EventBridge invokes it in production. Used by the e2e suite
// (playwright/helpers/run-auto-cancel.ts) to exercise the full sweep
// against a seeded test order. The handler exits non-zero on failure
// so the calling spec can assert on exit code in addition to output.

import 'dotenv/config';
import { handler } from '../auto-cancel-lambda.js';

handler()
	.then((result) => {
		console.log(JSON.stringify(result, null, 2));
		process.exit(0);
	})
	.catch((err) => {
		console.error(err instanceof Error ? err.stack ?? err.message : String(err));
		process.exit(1);
	});

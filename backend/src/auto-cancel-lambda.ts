// AWS Lambda entry for the daily auto-cancel sweep. Invoked by an
// EventBridge schedule rule (see infra/auto_cancel.tf). Deliberately
// minimal — all the logic lives in ./auto-cancel.ts so it can be
// imported by tests without dragging the Lambda runtime in.
//
// NOTE: do not import './server.js' or 'dotenv' here. esbuild bundles
// this file as the auto-cancel Lambda's handler; pulling in dotenv
// would bloat the cold start (same constraint as lambda.ts).

import { autoCancelStaleOrders } from './auto-cancel.js';

export const handler = async () => {
	console.log('auto-cancel: invoked');
	const result = await autoCancelStaleOrders();
	console.log(
		`auto-cancel: complete — cutoff=${result.cutoffIso} found=${result.found} cancelled=${result.cancelled} failed=${result.failed}`
	);
	return result;
};

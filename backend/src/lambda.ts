import { handle, type LambdaEvent } from 'hono/aws-lambda';
import type { ScheduledEvent, Context } from 'aws-lambda';
import { createApp } from './app.js';
import { runPiiCleanup } from './pii-cleanup.js';

const httpHandler = handle(createApp());

/**
 * Single Lambda function URL serving two distinct event sources:
 *
 * 1. **HTTP requests** via the Function URL — the regular Hono app.
 * 2. **EventBridge scheduled invocations** for the PII retention sweep.
 *    EventBridge events have `source === 'aws.events'`; the schedule
 *    rule is defined in `infra/pii_cleanup.tf`.
 *
 * Dispatching here keeps both code paths in one deployment unit while
 * keeping the runtime IAM role identical (the Sanity write token already
 * lives in the Lambda env).
 */
export const handler = async (event: LambdaEvent | ScheduledEvent, context: Context) => {
	if (isScheduledEvent(event)) {
		return runPiiCleanup();
	}
	return httpHandler(event, context);
};

function isScheduledEvent(event: LambdaEvent | ScheduledEvent): event is ScheduledEvent {
	return (event as { source?: string }).source === 'aws.events';
}

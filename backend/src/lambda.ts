import { handle } from 'hono/aws-lambda';
import { createApp } from './app.js';

// Lambda entrypoint. Phase 1: the Lambda serves HTTP requests only —
// the pre-Phase-1 dual-purpose dispatcher that also handled
// EventBridge-scheduled PII-cleanup invocations is gone, replaced by
// per-row DynamoDB TTL on the orders table. The corresponding
// EventBridge rule was removed from infra/.
export const handler = handle(createApp());

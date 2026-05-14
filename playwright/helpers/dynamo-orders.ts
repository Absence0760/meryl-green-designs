import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	GetCommand,
	ScanCommand,
	UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { assertNotProd } from './env-guard.ts';

// Read-side access to the local LocalStack DynamoDB so specs can
// assert "the PII row landed". Specs should NOT write to DynamoDB
// directly — every write goes through the backend's HTTP surface so
// the test exercises the same code path the live Lambda would take.

let _client: DynamoDBDocumentClient | null = null;

function client(): DynamoDBDocumentClient {
	if (_client) return _client;
	assertNotProd();
	const endpoint = process.env.DYNAMODB_ENDPOINT;
	if (!endpoint) throw new Error('[dynamo-orders] DYNAMODB_ENDPOINT unset');
	const raw = new DynamoDBClient({
		endpoint,
		region: 'af-south-1',
		credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
	});
	_client = DynamoDBDocumentClient.from(raw);
	return _client;
}

function tableName(): string {
	const t = process.env.ORDERS_TABLE_NAME;
	if (!t) throw new Error('[dynamo-orders] ORDERS_TABLE_NAME unset');
	return t;
}

export async function getOrderPii(orderRef: string): Promise<Record<string, unknown> | null> {
	const c = client();
	const result = await c.send(
		new GetCommand({ TableName: tableName(), Key: { orderRef } }),
	);
	return (result.Item as Record<string, unknown> | undefined) ?? null;
}

export async function scanOrders(): Promise<Record<string, unknown>[]> {
	const c = client();
	const result = await c.send(new ScanCommand({ TableName: tableName() }));
	return (result.Items as Record<string, unknown>[] | undefined) ?? [];
}

/**
 * Backdate a PII row's createdAt so tests can exercise time-windowed
 * code paths (auto-cancel sweep, payment-retry 7-day window) without
 * actually waiting days. Updates both `createdAt` (ISO string) and
 * `ttl` (epoch seconds) since the backend reads both.
 */
export async function backdateOrder(orderRef: string, daysAgo: number): Promise<void> {
	const c = client();
	const created = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
	const ttlSeconds = Math.floor(created.getTime() / 1000) + 365 * 24 * 60 * 60;
	await c.send(
		new UpdateCommand({
			TableName: tableName(),
			Key: { orderRef },
			UpdateExpression: 'SET createdAt = :ts, #ttl = :ttl',
			ExpressionAttributeNames: { '#ttl': 'ttl' },
			ExpressionAttributeValues: { ':ts': created.toISOString(), ':ttl': ttlSeconds },
		}),
	);
}

/**
 * Force the retry-attempt counter to a specific value so a single
 * spec can verify the cap-exhausted path without issuing five real
 * retries (which would also consume real PayFast sandbox interactions).
 */
export async function setRetryAttempts(orderRef: string, attempts: number): Promise<void> {
	const c = client();
	await c.send(
		new UpdateCommand({
			TableName: tableName(),
			Key: { orderRef },
			UpdateExpression: 'SET retryAttempts = :n',
			ExpressionAttributeValues: { ':n': attempts },
		}),
	);
}

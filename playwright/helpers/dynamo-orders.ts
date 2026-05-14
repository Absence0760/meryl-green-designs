import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
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

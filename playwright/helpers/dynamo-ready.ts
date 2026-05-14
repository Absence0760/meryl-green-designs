import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

// Confirm LocalStack DynamoDB is reachable and the orders table exists.
// Runs from global-setup before the backend webServer boots, so a
// missing table produces a clear error early instead of a Playwright
// timeout further down.

export async function assertLocalDynamoReady(): Promise<void> {
	const endpoint = process.env.DYNAMODB_ENDPOINT;
	const tableName = process.env.ORDERS_TABLE_NAME;
	if (!endpoint || !tableName) {
		throw new Error('[dynamo-ready] DYNAMODB_ENDPOINT or ORDERS_TABLE_NAME missing');
	}

	const client = new DynamoDBClient({
		endpoint,
		region: 'af-south-1',
		credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
	});

	try {
		await client.send(new DescribeTableCommand({ TableName: tableName }));
	} catch (err) {
		const hint = [
			'',
			`LocalStack is not ready at ${endpoint} (or the ${tableName} table is missing).`,
			'',
			'  Bring it up with:  pnpm dev:db:up',
			'',
		].join('\n');
		throw new Error(`[dynamo-ready] ${(err as Error).message}\n${hint}`);
	}
}

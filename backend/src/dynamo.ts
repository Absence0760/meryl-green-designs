import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cachedClient: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBDocumentClient {
	if (cachedClient) return cachedClient;
	const region = process.env.AWS_REGION ?? 'af-south-1';
	const base = new DynamoDBClient({ region });
	cachedClient = DynamoDBDocumentClient.from(base, {
		marshallOptions: {
			// Match Sanity's nullable convention — undefined fields are
			// dropped, explicit nulls are kept.
			removeUndefinedValues: true
		}
	});
	return cachedClient;
}

export function getOrdersTableName(): string {
	const name = process.env.ORDERS_TABLE_NAME;
	if (!name) {
		throw new Error('ORDERS_TABLE_NAME is not configured.');
	}
	return name;
}

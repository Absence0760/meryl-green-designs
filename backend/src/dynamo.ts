import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cachedClient: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBDocumentClient {
	if (cachedClient) return cachedClient;
	const region = process.env.AWS_REGION ?? 'af-south-1';
	const endpoint = process.env.DYNAMODB_ENDPOINT?.trim();

	const config: DynamoDBClientConfig = { region };
	if (endpoint) {
		// Local dev (docker-compose / dynamodb-local). Inject dummy
		// credentials so the SDK doesn't try EC2 IMDS or the shared
		// credentials file. Prod leaves DYNAMODB_ENDPOINT unset and
		// picks up the Lambda role.
		config.endpoint = endpoint;
		config.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
	}

	const base = new DynamoDBClient(config);
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

import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cachedClient: DynamoDBDocumentClient | null = null;

// Hard isolation guard. Refuses to construct a client that would reach
// real AWS unless one of three conditions holds:
//   1. DYNAMODB_ENDPOINT is set (local docker-compose, or any explicit
//      override).
//   2. Running inside the deployed Lambda (AWS_LAMBDA_FUNCTION_NAME
//      is set automatically by the runtime).
//   3. The caller has explicitly opted in via ALLOW_REAL_AWS=1 —
//      used by the backfill/restore scripts after their `--prod`
//      gate clears.
// Anything else (typically `pnpm backend dev` with a malformed .env
// and a valid AWS SSO session) throws here rather than silently
// promoting itself into a prod write.
export function assertSafeForRealAws(env: NodeJS.ProcessEnv = process.env): void {
	const endpoint = env.DYNAMODB_ENDPOINT?.trim();
	if (endpoint) return;
	if (env.AWS_LAMBDA_FUNCTION_NAME) return;
	if (env.ALLOW_REAL_AWS === '1') return;
	throw new Error(
		'Refusing to connect to real AWS DynamoDB: DYNAMODB_ENDPOINT is unset, AWS_LAMBDA_FUNCTION_NAME is unset, and ALLOW_REAL_AWS is not "1". Set DYNAMODB_ENDPOINT in backend/.env (start docker-compose with `pnpm dev:db:up`) for local dev, or set ALLOW_REAL_AWS=1 to acknowledge a prod write.'
	);
}

export function getDynamoClient(): DynamoDBDocumentClient {
	if (cachedClient) return cachedClient;
	assertSafeForRealAws();
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

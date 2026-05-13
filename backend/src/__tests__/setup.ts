// Global test setup — populates all the env vars the backend expects,
// so tests run in a configured state without hitting real services.
// Individual tests can use vi.stubEnv() to override or unset specific
// vars for "what happens when X is missing" coverage.

process.env.RESEND_API_KEY = 'test-resend-key';
process.env.FROM_EMAIL = 'Meryl Green Designs <test@example.com>';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.ALLOWED_ORIGINS = 'http://localhost:7777,https://merylgreendesigns.com';
process.env.SITE_URL = 'http://localhost:7777';

process.env.SANITY_PROJECT_ID = 'test-project';
process.env.SANITY_DATASET = 'production';
process.env.SANITY_API_TOKEN = 'test-sanity-token';
process.env.SANITY_WEBHOOK_SECRET = 'test-webhook-secret';

process.env.AWS_REGION = 'af-south-1';
process.env.ORDERS_TABLE_NAME = 'meryl-green-designs-orders-test';
// Force the dynamo.ts safety assertion to treat tests as a local-dev
// path — no real AWS endpoint is dialled because aws-sdk-client-mock
// intercepts every .send() before the network call.
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';

process.env.ADMIN_API_TOKEN = 'test-admin-token';
process.env.STUDIO_ORIGINS = 'http://localhost:3333';

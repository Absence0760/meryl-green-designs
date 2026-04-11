// Global test setup — populates all the env vars the backend expects,
// so tests run in a configured state without hitting real services.
// Individual tests can use vi.stubEnv() to override or unset specific
// vars for "what happens when X is missing" coverage.

process.env.RESEND_API_KEY = 'test-resend-key';
process.env.FROM_EMAIL = 'Meryl Green Designs <test@example.com>';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.ALLOWED_ORIGINS = 'http://localhost:7777,https://merylgreendesigns.co.za';
process.env.SITE_URL = 'http://localhost:7777';

process.env.SANITY_PROJECT_ID = 'test-project';
process.env.SANITY_DATASET = 'production';
process.env.SANITY_API_TOKEN = 'test-sanity-token';
process.env.SANITY_WEBHOOK_SECRET = 'test-webhook-secret';

// Banking details are injected into the pending-payment email at send time
// so they never live in git. Tests use fake values; real ones are set via
// Lambda env vars (see infra/variables.tf) and backend/.env locally.
process.env.BANK_ACCOUNT_NAME = 'Test Account Holder';
process.env.BANK_NAME = 'Test Bank';
process.env.BANK_ACCOUNT_NUMBER = '0000000000';
process.env.BANK_BRANCH_CODE = '000000';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Load the e2e env (test Sanity project, LocalStack endpoint, sandbox PayFast).
// `override: true` so a stale prod value in the shell can't leak in.
loadEnv({ path: path.join(__dirname, '.env'), override: true });
loadEnv({ path: path.join(__dirname, '.env.local'), override: true });

// E2E suite invariants. These values are fixed for any test run — the
// env-guard rejects anything else — so seed sensible defaults rather
// than force the operator to remember them in .env. `??=` only fires
// when the key is genuinely unset, so a deliberately wrong value in
// the shell or .env still flows through to the env-guard and aborts.
process.env.EMAIL_BACKEND ??= 'file';
process.env.PAYFAST_SANDBOX ??= 'true';
process.env.PAYFAST_MERCHANT_ID ??= '10004002';
process.env.PAYFAST_MERCHANT_KEY ??= 'q1cd2rdny4a53';
process.env.PAYFAST_PASSPHRASE ??= 'payfast';

const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 7777);
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 3001);

// Env handed to the spawned backend + frontend dev servers. The env-guard
// in global-setup.ts will refuse to run if any of these point at prod.
const sharedServerEnv = {
	NODE_ENV: 'test',
	PORT: String(BACKEND_PORT),

	// Sanity — must be the test-e2e dataset/project, never production
	SANITY_PROJECT_ID: must('SANITY_PROJECT_ID'),
	SANITY_DATASET: must('SANITY_DATASET'),
	SANITY_API_TOKEN: must('SANITY_API_TOKEN'),
	SANITY_WEBHOOK_SECRET: must('SANITY_WEBHOOK_SECRET'),
	// Bypass Sanity's CDN so write-then-read flows in specs (placeOrder
	// → immediate /track lookup) see the just-written skeleton instead of
	// a stale 404. Production keeps useCdn:true via backend/src/sanity.ts.
	SANITY_USE_CDN: 'false',

	// DynamoDB — LocalStack only
	ORDERS_TABLE_NAME: must('ORDERS_TABLE_NAME'),
	DYNAMODB_ENDPOINT: must('DYNAMODB_ENDPOINT'),
	AWS_ACCESS_KEY_ID: 'local',
	AWS_SECRET_ACCESS_KEY: 'local',
	AWS_REGION: 'af-south-1',

	// Email — file backend, never Resend
	EMAIL_BACKEND: 'file',
	FROM_EMAIL: process.env.FROM_EMAIL ?? 'orders@e2e.local',
	OWNER_EMAIL: process.env.OWNER_EMAIL ?? 'owner@e2e.local',

	// PayFast — sandbox merchant only
	PAYFAST_SANDBOX: 'true',
	PAYFAST_MERCHANT_ID: process.env.PAYFAST_MERCHANT_ID ?? '10004002',
	PAYFAST_MERCHANT_KEY: process.env.PAYFAST_MERCHANT_KEY ?? 'q1cd2rdny4a53',
	PAYFAST_PASSPHRASE: process.env.PAYFAST_PASSPHRASE ?? 'payfast',

	// Admin token + CORS allowlist (constant for tests)
	ADMIN_API_TOKEN: must('ADMIN_API_TOKEN'),
	STUDIO_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
	ALLOWED_ORIGINS: `http://localhost:${FRONTEND_PORT}`,

	// Disable rate limiting in the test backend — every spec hits localhost
	// from the same `unknown` x-forwarded-for bucket and would otherwise
	// trip the 5/15min cap mid-suite. The flag is only honoured by
	// backend/src/rate-limit.ts; Terraform's Lambda env never sets it.
	RATE_LIMIT_DISABLED: 'true',

	// Site URLs
	SITE_URL: `http://localhost:${FRONTEND_PORT}`,
	API_URL: `http://localhost:${BACKEND_PORT}`,
};

const frontendBuildEnv = {
	PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}`,
	PUBLIC_SITE_URL: `http://localhost:${FRONTEND_PORT}`,
	PUBLIC_SANITY_PROJECT_ID: must('SANITY_PROJECT_ID'),
	PUBLIC_SANITY_DATASET: must('SANITY_DATASET'),
};

export default defineConfig({
	testDir: './tests',
	globalSetup: './global-setup.ts',
	globalTeardown: './global-teardown.ts',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: false, // shared backend state (DynamoDB, Sanity), serialise
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],
	use: {
		baseURL: `http://localhost:${FRONTEND_PORT}`,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: [
		{
			command: 'pnpm --filter @meryl-green-designs/backend dev',
			cwd: repoRoot,
			url: `http://localhost:${BACKEND_PORT}/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			stdout: 'pipe',
			stderr: 'pipe',
			env: sharedServerEnv,
		},
		{
			command: 'pnpm --filter @meryl-green-designs/frontend dev',
			cwd: repoRoot,
			url: `http://localhost:${FRONTEND_PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			stdout: 'pipe',
			stderr: 'pipe',
			env: frontendBuildEnv,
		},
	],
});

function must(key: string): string {
	const v = process.env[key];
	if (!v) {
		throw new Error(
			`[playwright.config] ${key} is unset. Copy playwright/.env.example to playwright/.env and fill it in.`,
		);
	}
	return v;
}

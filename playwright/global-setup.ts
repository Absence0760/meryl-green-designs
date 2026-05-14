import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProd } from './helpers/env-guard.ts';
import { wipeAndSeedSanity } from './helpers/seed-sanity.ts';
import { assertLocalDynamoReady } from './helpers/dynamo-ready.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup(): Promise<void> {
	loadEnv({ path: path.join(__dirname, '.env'), override: true });
	loadEnv({ path: path.join(__dirname, '.env.local'), override: true });

	// Step 1: refuse to run if any env var points at prod. Fail fast,
	// before any destructive client is constructed.
	assertNotProd();

	// Step 2: confirm LocalStack is reachable and the orders table exists.
	// This is also what the backend will hit when it boots; failing here
	// gives a clearer error than the backend timing out under webServer.
	await assertLocalDynamoReady();

	// Step 3: wipe + seed Sanity test dataset. Idempotent; safe to re-run.
	await wipeAndSeedSanity();
}

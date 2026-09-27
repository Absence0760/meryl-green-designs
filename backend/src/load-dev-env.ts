// Local-dev env loader, imported FIRST by server.ts so the values are in
// process.env before any other module evaluates (ES imports are hoisted, so
// a config() call inside server.ts itself would run too late).
//
// The committed .env.development holds non-sensitive defaults (local
// content, file email, LocalStack, PayFast sandbox); the gitignored
// .env.development.local (listed first → wins, key by key) holds personal
// overrides and any real secrets. Missing files are skipped silently, so a
// fresh clone runs with zero env setup. Values already in the process
// environment (e.g. from Playwright's webServer) win over both.
//
// Only reachable from server.ts — never import this from lambda.ts,
// auto-cancel-lambda.ts or anything app.ts imports (keeps dotenv out of the
// Lambda bundles; see backend/CLAUDE.md).
import { existsSync } from 'node:fs';
import { config } from 'dotenv';

export const DEV_ENV_FILES = ['.env.development.local', '.env.development'];

config({ path: DEV_ENV_FILES, quiet: true });

if (existsSync('.env')) {
	console.warn(
		'backend/.env is no longer loaded. Move its values to backend/.env.development.local (see docs/run-locally.md).'
	);
}

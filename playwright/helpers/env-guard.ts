// Hard guard against ever pointing the e2e suite at production resources.
//
// Why this exists: the e2e suite wipes + reseeds Sanity at the start of
// every run, and the backend it spawns writes to DynamoDB. If either
// pointed at prod, a CI run would destroy customer data. This module
// runs from global-setup before any test file imports the Sanity client
// or the AWS SDK, so a misconfigured env aborts the process before any
// destructive call can happen.
//
// Extend the `checks` array whenever a new env var enters the picture
// that could plausibly target a production resource.

type Check = {
	key: string;
	ok: (value: string | undefined) => boolean;
	hint: string;
};

const LOCAL_DYNAMO_PREFIXES = [
	'http://localhost',
	'http://127.0.0.1',
	'http://localstack',
	'http://0.0.0.0',
];

const checks: Check[] = [
	{
		key: 'SANITY_DATASET',
		ok: (v) => typeof v === 'string' && v.length > 0 && v !== 'production',
		hint: 'must be a dedicated test dataset (e.g. "test-e2e"), never "production"',
	},
	{
		key: 'DYNAMODB_ENDPOINT',
		ok: (v) => typeof v === 'string' && LOCAL_DYNAMO_PREFIXES.some((p) => v.startsWith(p)),
		hint: `must start with one of ${LOCAL_DYNAMO_PREFIXES.join(' | ')} — DynamoDB writes go to LocalStack only`,
	},
	{
		key: 'EMAIL_BACKEND',
		ok: (v) => v === 'file',
		hint: 'must be "file" — tests read backend/.dev-emails/ instead of sending real mail through Resend',
	},
	{
		key: 'PAYFAST_SANDBOX',
		ok: (v) => v === 'true',
		hint: 'must be "true" — tests sign forms for sandbox.payfast.co.za, not the live gateway',
	},
	{
		key: 'PAYFAST_MERCHANT_ID',
		ok: (v) => v === '10004002',
		hint: 'must be the public PayFast sandbox merchant id (10004002)',
	},
	{
		key: 'ALLOW_REAL_AWS',
		ok: (v) => !v,
		hint: 'must NOT be set — that flag exists for ops scripts that have already validated their gate',
	},
	{
		key: 'AWS_PROFILE',
		ok: (v) => !v,
		hint: 'must NOT be set — a stale prod profile in the shell would let the AWS SDK find real credentials',
	},
];

export function assertNotProd(): void {
	const failures = checks.filter((c) => !c.ok(process.env[c.key]));
	if (failures.length === 0) return;

	const lines = [
		'',
		'╔══════════════════════════════════════════════════════════════════════╗',
		'║  E2E ENV GUARD — REFUSING TO RUN                                     ║',
		'║                                                                      ║',
		'║  One or more env vars would point this suite at production.         ║',
		'║  Aborting before any Sanity wipe or DynamoDB write happens.         ║',
		'╚══════════════════════════════════════════════════════════════════════╝',
		'',
	];
	for (const f of failures) {
		const current = process.env[f.key];
		const display = current === undefined ? '<unset>' : JSON.stringify(current);
		lines.push(`  ✗ ${f.key}=${display}`);
		lines.push(`    → ${f.hint}`);
		lines.push('');
	}
	lines.push('See playwright/.env.example for the expected shape.');
	lines.push('');
	throw new Error(lines.join('\n'));
}

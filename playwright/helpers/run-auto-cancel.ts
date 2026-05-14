import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Invoke the auto-cancel Lambda handler in a subprocess so the e2e
// suite exercises the same entry point EventBridge calls in
// production. Spawning a subprocess (rather than importing the
// handler directly from playwright/) keeps the workspace dependency
// graph clean — the playwright workspace never imports backend
// source files.
//
// The subprocess inherits the test runner's env (SANITY_*, DYNAMODB_*,
// AUTO_CANCEL_DAYS, etc.), so the handler points at the same
// LocalStack table + test Sanity dataset the rest of the suite uses.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

export type AutoCancelResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
	/** Parsed result JSON extracted from the marker-bracketed stdout. */
	result: { cutoffIso: string; found: number; cancelled: number; failed: number } | null;
};

const RESULT_RE = /__AUTO_CANCEL_RESULT__(\{[\s\S]*?\})__END__/;

export function runAutoCancelHandler(
	opts: { days?: number; env?: Record<string, string | undefined> } = {},
): Promise<AutoCancelResult> {
	return new Promise((resolve, reject) => {
		const env = { ...process.env, ...(opts.env ?? {}) };
		const args = [
			'--filter',
			'@meryl-green-designs/backend',
			'exec',
			'tsx',
			'src/scripts/run-auto-cancel.ts',
		];
		if (opts.days !== undefined) args.push('--days', String(opts.days));
		const child = spawn('pnpm', args, {
			cwd: repoRoot,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
		child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
		child.on('error', reject);
		child.on('close', (code) => {
			const match = RESULT_RE.exec(stdout);
			const result = match ? (JSON.parse(match[1]) as AutoCancelResult['result']) : null;
			resolve({ stdout, stderr, exitCode: code ?? -1, result });
		});
	});
}

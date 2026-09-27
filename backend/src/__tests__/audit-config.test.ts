import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards the root package.json `pnpm.auditConfig.ignoreGhsas` list. Every
// ignored advisory must be a known false positive with a check proving the
// real package is patched, so an ignore can never hide a genuine finding.

const repoRoot = resolve(__dirname, '../../..');
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const lockfile = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8');

function lockedVersions(name: string): string[] {
	const re = new RegExp(`^  '?${name.replace('/', '\\/')}@([0-9][^':(]*)'?:`, 'gm');
	return [...lockfile.matchAll(re)].map((m) => m[1] ?? '');
}

function atLeast(version: string, min: string): boolean {
	const a = version.split('.').map(Number);
	const b = min.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x !== y) return x > y;
	}
	return true;
}

// GHSA id → the package that must be locked at a patched version.
const KNOWN_FALSE_POSITIVES: Record<string, { pkg: string; patched: string }> = {
	// pnpm audit mistakes the `playwright/` workspace (version 0.0.1) for the
	// npm `playwright` package. The real dependency is patched.
	'GHSA-7mvr-c777-76hp': { pkg: 'playwright', patched: '1.55.1' }
};

describe('pnpm audit ignore list', () => {
	const ignored: string[] = rootPkg.pnpm?.auditConfig?.ignoreGhsas ?? [];

	it('only ignores documented false positives', () => {
		for (const ghsa of ignored) {
			expect(KNOWN_FALSE_POSITIVES, `${ghsa} has no documented reason`).toHaveProperty(ghsa);
		}
	});

	it.each(Object.entries(KNOWN_FALSE_POSITIVES))(
		'%s: every locked version of the real package is patched',
		(_ghsa, { pkg, patched }) => {
			const versions = lockedVersions(pkg);
			expect(versions.length).toBeGreaterThan(0);
			for (const v of versions) {
				expect(atLeast(v, patched), `${pkg}@${v} < ${patched}`).toBe(true);
			}
		}
	);
});

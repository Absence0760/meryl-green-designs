import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards the pnpm settings in the root pnpm-workspace.yaml:
// - every `auditConfig.ignoreGhsas` entry is a known false positive with a
//   check proving the real package is patched, so an ignore can never hide a
//   genuine finding;
// - the lockfile's `overrides:` block matches the workspace's. Dependabot's
//   lockfile regenerations once dropped the overrides (they lived in
//   package.json's `pnpm` field, which newer pnpm ignores), silently
//   reopening every advisory they patched.

const repoRoot = resolve(__dirname, '../../..');
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const workspace = readFileSync(resolve(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
const lockfile = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8');

// Lines of a top-level YAML block (`key:` then indented lines), comments and
// blanks dropped. Enough for the flat maps / lists these files use.
function yamlBlock(text: string, key: string): string[] {
	const lines = text.split('\n');
	const start = lines.indexOf(`${key}:`);
	if (start === -1) return [];
	const out: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/.test(line)) break;
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith('#')) out.push(trimmed);
	}
	return out;
}

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

describe('pnpm overrides', () => {
	const overrides = yamlBlock(workspace, 'overrides');

	it('are declared in pnpm-workspace.yaml, not package.json', () => {
		expect(overrides.length).toBeGreaterThan(0);
		expect(rootPkg.pnpm, 'package.json `pnpm` field is ignored by newer pnpm').toBeUndefined();
	});

	it('are applied in pnpm-lock.yaml', () => {
		expect(yamlBlock(lockfile, 'overrides')).toEqual(overrides);
	});
});

describe('pnpm audit ignore list', () => {
	const ignored = yamlBlock(workspace, 'auditConfig')
		.filter((line) => line.startsWith('- '))
		.map((line) => line.slice(2).trim());

	it('is read from pnpm-workspace.yaml', () => {
		expect(ignored).toContain('GHSA-7mvr-c777-76hp');
	});

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

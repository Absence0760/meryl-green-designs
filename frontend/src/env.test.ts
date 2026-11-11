import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { variables } from './env';
import { REQUIRED_PRODUCTION_ENV } from './lib/build-env';

// SvelteKit 3 publishes only the variables declared in src/env.ts. These
// guard the two ways that can silently go wrong on a static site: a
// variable the code reads but nobody declared, and one that is read at
// runtime instead of inlined at build time (there is no server to read it).

const srcDir = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		return /\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
	});
}

describe('src/env.ts', () => {
	it('declares every PUBLIC_* variable the frontend reads', () => {
		const used = new Set<string>();
		for (const file of sourceFiles(srcDir)) {
			for (const m of readFileSync(file, 'utf8').matchAll(/\bPUBLIC_[A-Z0-9_]+\b/g)) used.add(m[0]);
		}
		expect(used.size).toBeGreaterThan(0);
		for (const name of used) expect(Object.keys(variables), name).toContain(name);
	});

	it('makes every variable public and inlined at build time', () => {
		for (const [name, config] of Object.entries(variables)) {
			expect(config, name).toMatchObject({ public: true, static: true });
		}
	});

	it('declares every key the production build guard requires', () => {
		for (const name of REQUIRED_PRODUCTION_ENV) expect(Object.keys(variables)).toContain(name);
	});
});

// esbuild config for the two Lambda bundles. Run via `pnpm backend build`
// (or `build:lambda` / `build:auto-cancel`); `src/__tests__/bundle.test.ts`
// imports `bundleOptions` so the size/contents guards test the real config.
//
//   node scripts/build.mjs [lambda|auto-cancel ...]   (default: both)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('..', import.meta.url));

export const bundles = {
	lambda: { entry: 'src/lambda.ts', outfile: 'dist/lambda.mjs' },
	'auto-cancel': { entry: 'src/auto-cancel-lambda.ts', outfile: 'dist/auto-cancel.mjs' }
};

/** @returns {import('esbuild').BuildOptions} */
export function bundleOptions(name) {
	const b = bundles[name];
	if (!b) throw new Error(`unknown bundle "${name}" (expected: ${Object.keys(bundles).join(', ')})`);
	return {
		absWorkingDir: backendDir,
		entryPoints: [b.entry],
		outfile: b.outfile,
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'esm',
		// ESM output still has CJS deps (AWS SDK, rxjs) that call `require`.
		banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
		// @sanity/client v8 → get-it v9 statically imports npm `undici` (~1 MB)
		// just for proxy support; Node 22's global fetch is undici already.
		// See src/shims/undici.ts for the exact trade-offs.
		alias: { undici: './src/shims/undici.ts' },
		logLevel: 'info'
	};
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const names = process.argv.slice(2);
	for (const name of names.length ? names : Object.keys(bundles)) {
		await build(bundleOptions(name));
	}
}

// Guards on the esbuild Lambda bundles (scripts/build.mjs): what goes in,
// how big they are, and that the built artefact actually runs. Uses the
// real build config so a flag change can't drift from what's tested.
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Metafile } from 'esbuild';
import { afterAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations
import { bundleOptions } from '../../scripts/build.mjs';

type BundleName = 'lambda' | 'auto-cancel';

// Budgets sit ~20% above the post-undici-shim sizes (2.12 MB / 0.67 MB) so
// a dependency that silently drags in a megabyte fails CI, while routine
// minor bumps don't. Raise deliberately, and update docs/deployment.md.
const BUDGET_BYTES: Record<BundleName, number> = {
	lambda: 2.5 * 1024 * 1024,
	'auto-cancel': 0.8 * 1024 * 1024
};

const outDir = mkdtempSync(join(tmpdir(), 'mgd-bundle-test-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

async function buildWithMeta(name: BundleName, overrides: Record<string, unknown> = {}) {
	const outfile = join(outDir, `${name}-${Math.random().toString(36).slice(2)}.mjs`);
	const result = await build({
		...bundleOptions(name),
		outfile,
		metafile: true,
		logLevel: 'silent',
		...overrides
	});
	return { outfile, metafile: result.metafile as Metafile };
}

const inputsMatching = (meta: Metafile, re: RegExp) => Object.keys(meta.inputs).filter((p) => re.test(p));

describe.each<BundleName>(['lambda', 'auto-cancel'])('%s bundle', (name) => {
	it('excludes npm undici, dotenv and dev-server deps; stays under budget', async () => {
		const { metafile } = await buildWithMeta(name);

		expect(inputsMatching(metafile, /node_modules\/undici\//)).toEqual([]);
		expect(inputsMatching(metafile, /node_modules\/(dotenv|@hono\/node-server)\//)).toEqual([]);
		expect(inputsMatching(metafile, /src\/shims\/undici\.ts$/)).toHaveLength(1);

		// Only get-it's Node fetch factory may lean on the shim. A new
		// importer means some other package expects the real undici — review
		// before extending the allow-list.
		const importers = Object.entries(metafile.inputs)
			.filter(([, input]) => input.imports.some((i) => i.path.endsWith('src/shims/undici.ts')))
			.map(([path]) => path.replace(/.*node_modules\//, ''));
		expect(importers.length).toBeGreaterThan(0);
		for (const importer of importers) expect(importer).toMatch(/^get-it\/dist\/createNodeFetch-[\w-]+\.js$/);

		const [output] = Object.values(metafile.outputs);
		expect(output!.bytes).toBeLessThan(BUDGET_BYTES[name]);
	});
});

describe('built lambda.mjs', () => {
	it('serves GET /health without touching the network', async () => {
		const { outfile } = await buildWithMeta('lambda');
		vi.stubEnv('CONTENT_BACKEND', '');
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in test'));
		try {
			const mod = (await import(pathToFileURL(outfile).href)) as {
				handler: (event: unknown, context: unknown) => Promise<{ statusCode: number; body: string }>;
			};
			const res = await mod.handler(
				{
					version: '2.0',
					routeKey: '$default',
					rawPath: '/health',
					rawQueryString: '',
					headers: { host: 'api.example.com' },
					requestContext: {
						http: { method: 'GET', path: '/health', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
						domainName: 'api.example.com',
						requestId: 'test',
						stage: '$default'
					},
					isBase64Encoded: false
				},
				{}
			);
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.body)).toEqual({ ok: true });
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
			vi.unstubAllEnvs();
		}
	});
});

describe('undici shim inside a bundle', () => {
	let server: Server | undefined;
	afterAll(() => server?.close());

	it('lets the bundled @sanity/client query over global fetch', async () => {
		const seen: { url?: string; auth?: string; ua?: string } = {};
		server = createServer((req, res) => {
			seen.url = req.url;
			seen.auth = req.headers.authorization;
			seen.ua = req.headers['user-agent'];
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ result: [{ _id: 'p1' }], ms: 1, query: '*' }));
		});
		await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;

		// Same build config as the Lambda, different entry: a Sanity client
		// pointed at the local server. Exercises the real get-it → shim path.
		const { outfile } = await buildWithMeta('lambda', {
			entryPoints: undefined,
			stdin: {
				contents: `import { createClient } from '@sanity/client';
export const run = (apiHost) => createClient({
	projectId: 'test', dataset: 'production', apiVersion: '2024-10-01',
	apiHost, useProjectHostname: false, useCdn: false, token: 'tkn',
}).fetch('*[_type == "product"]');`,
				resolveDir: bundleOptions('lambda').absWorkingDir,
				loader: 'js'
			}
		});
		const mod = (await import(pathToFileURL(outfile).href)) as { run: (host: string) => Promise<unknown> };

		await expect(mod.run(`http://127.0.0.1:${port}`)).resolves.toEqual([{ _id: 'p1' }]);
		expect(seen.url).toMatch(/^\/v2024-10-01\/data\/query\/production\?query=/);
		expect(seen.auth).toBe('Bearer tkn');
		// Node-entry middleware (User-Agent etc.) still applies — we kept
		// @sanity/client's node build and only swapped the transport.
		expect(seen.ua).toMatch(/^@sanity\/client 8\./);
	});
});

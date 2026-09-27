/**
 * Lambda-bundle stand-in for the `undici` package. esbuild aliases
 * `undici` to this file (`--alias:undici=...` in `package.json`'s
 * `build:*` scripts); tests and `tsx` dev never see it.
 *
 * Why: `@sanity/client` v8's Node entry → `get-it` v9's `createNodeFetch`
 * statically imports `undici` (~1 MB bundled) only to wrap its `fetch` with
 * an HTTP-proxy-aware dispatcher. Node 22's global `fetch` *is* undici, so
 * on Lambda (no proxy) the npm copy is dead weight.
 *
 * The surface below is exactly what `get-it`'s `createNodeFetch` imports:
 * `Agent`, `EnvHttpProxyAgent`, `ProxyAgent`, `FormData`, `fetch`. esbuild
 * fails the build if an ESM importer asks for a name this file doesn't
 * export, and `bundle.test.ts` pins who imports `undici` at all.
 *
 * Behavioural differences vs. real undici (all irrelevant on Lambda):
 * - `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` are ignored (Node's global
 *   fetch doesn't read them without `NODE_USE_ENV_PROXY`).
 * - An explicit Sanity `proxy` URL throws instead of silently bypassing it.
 * - `connections` / `allowH2` / TLS dispatcher options are ignored; Node's
 *   global dispatcher defaults apply.
 * - Explicit `Host` header preservation is skipped (the dispatcher has no
 *   `compose`), which `get-it` already treats as a supported fallback.
 */

/** Marker dispatcher — carries no behaviour; `fetch` below drops it. */
export class Agent {
	constructor(_options?: unknown) {}
}

/** Same as `Agent`: env proxy vars are not honoured in the Lambda bundle. */
export class EnvHttpProxyAgent extends Agent {}

export class ProxyAgent extends Agent {
	constructor(_options?: unknown) {
		super();
		throw new Error(
			'Explicit HTTP proxies are not supported in the Lambda bundle (undici is shimmed to global fetch — see backend/src/shims/undici.ts)'
		);
	}
}

export const FormData = globalThis.FormData;

type FetchInit = RequestInit & { dispatcher?: unknown };

export function fetch(input: string | URL | Request, init?: FetchInit): Promise<Response> {
	if (!init) return globalThis.fetch(input);
	const { dispatcher: _dispatcher, ...rest } = init;
	return globalThis.fetch(input, rest);
}

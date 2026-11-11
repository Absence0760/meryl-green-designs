import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import type { Warning } from 'svelte/compiler';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { missingProductionEnv } from './src/lib/build-env.ts';

export default defineConfig({
	plugins: [
		productionEnvGuard(),
		// SvelteKit 3 takes its configuration here; svelte.config.js is
		// no longer read. What used to sit under `kit:` is top-level.
		sveltekit({
			compilerOptions: {
				modernAst: true,
				warningFilter
			},
			preprocess: [vitePreprocess()],
			// `fallback: '404.html'` makes adapter-static generate an SPA
			// shell for dynamic routes like `/shop/[slug]`, which can't be
			// enumerated at build time. CloudFront maps 403/404 to
			// `/404.html` with a 200 status (infra/s3_cloudfront.tf), so
			// the shell boots and client-side routing renders the page.
			adapter: adapter({ fallback: '404.html' }),
			paths: {
				base: (process.env.BASE_PATH || '') as '' | `/${string}`
			},
			// Inline every stylesheet under 16 KB into the prerendered HTML
			// (layout + app.css is ~15 KB raw / ~4 KB gzip, the rest 0.5–6 KB).
			// Each was a separate render-blocking request before first paint;
			// Lighthouse mobile put the cost at ~750 ms. Safe with our
			// headers: there is no CSP (see infra/security_headers.tf), so
			// inline <style> needs no nonce.
			inlineStyleThreshold: 16384
		})
	]
});

// A production build never reads the committed .env.development, so
// without PUBLIC_* in the environment SvelteKit fails with an opaque
// "not exported by virtual:env/static/public" error. Fail early with a
// clear one instead. deploy-frontend.yml sets these from repo vars.
//
// This runs in `buildStart`, not in the config function: SvelteKit 3's
// `svelte-kit sync` (and so `pnpm check`) resolves this config as a
// production `build` without building, and must not trip the guard.
function productionEnvGuard(): Plugin {
	let mode = '';
	let root = process.cwd();
	return {
		name: 'meryl-production-env-guard',
		apply: 'build',
		configResolved(config) {
			mode = config.mode;
			root = config.root;
		},
		buildStart() {
			if (mode !== 'production') return;
			const missing = missingProductionEnv({ ...loadEnv(mode, root, 'PUBLIC_'), ...process.env });
			if (missing.length > 0) {
				throw new Error(
					`Production build is missing ${missing.join(', ')}. Set them in the environment (CI does) or in a gitignored frontend/.env.production.local. For a local build with the dev defaults, run \`pnpm frontend build --mode development\`.`
				);
			}
		}
	};
}

// Silence a few noisy compiler warnings (deprecations we haven't migrated
// off yet, and a11y / unused-selector checks we've reviewed).
function warningFilter(warning: Warning): boolean {
	const ignoredWarningCodes = [
		'svelte_component_deprecated',
		'slot_element_deprecated',
		'a11y_no_noninteractive_tabindex',
		'css_unused_selector'
	];
	return !ignoredWarningCodes.includes(warning.code);
}

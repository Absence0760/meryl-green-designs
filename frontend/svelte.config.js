import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default defineConfig();

/** @type {() => import('@sveltejs/kit').Config} */
function defineConfig() {
	return {
		compilerOptions: {
			modernAst: true,
			warningFilter,
		},
		preprocess: [vitePreprocess()],

		kit: {
			// See https://kit.svelte.dev/docs/adapters for more information about adapters.
			// `fallback: '404.html'` makes adapter-static generate an SPA shell
			// for dynamic routes like `/shop/[slug]`, which can't be
			// enumerated at build time. GitHub Pages natively serves
			// `404.html` for any unknown path, so the SPA shell boots and
			// client-side routing renders the correct page. S3 + CloudFront
			// in production should be configured to map 4xx responses to
			// `404.html` with a 200 status for the same effect.
			adapter: adapter({ fallback: '404.html' }),
			paths: {
				base: process.env.BASE_PATH || '',
			},
			inlineStyleThreshold: 0,
		},
	};
}

/**
 * Filter out noisy deprecation warnings from the compiled code.
 * Hopefully by svelte 5's release, this will no longer be needed.
 * @type {NonNullable<NonNullable<import('@sveltejs/kit').Config['compilerOptions']>['warningFilter']>}
 */
function warningFilter(warning) {
	const ignorePatterns = [/node_modules/, /\.svelte-kit/];
	const ignoredWarningCodes = [
		"svelte_component_deprecated",
		"slot_element_deprecated",
		"a11y_no_noninteractive_tabindex",
		"css_unused_selector",
	];
	if (
		ignorePatterns.some((pattern) => pattern.test(warning.filename ?? "")) &&
		ignoredWarningCodes.includes(warning.code)
	) {
		return false;
	}

	// Also ignore the specific warnings we're seeing
	if (ignoredWarningCodes.includes(warning.code)) {
		return false;
	}

	return true;
}

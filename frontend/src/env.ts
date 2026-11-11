import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit 3 exposes only the environment variables declared here — the
// `PUBLIC_` prefix no longer publishes anything by itself. Every one is
// `public` (the site is static; there is no server to read private ones)
// and `static`, so its build-time value is inlined into the bundle exactly
// as `$env/static/public` used to. Import them from `$app/env/public`.
//
// Values come from the environment, plus frontend/.env.development in
// development mode (`pnpm dev`, `pnpm check`, `--mode development`). A
// production build gets them from deploy-frontend.yml; vite.config.ts fails
// it with a clear message if a required one is missing or blank.
export const variables = defineEnvVars({
	PUBLIC_API_URL: {
		public: true,
		static: true,
		description: 'Backend API base URL, reachable from the browser.'
	},
	PUBLIC_SITE_URL: {
		public: true,
		static: true,
		description: 'Public URL of this site (canonical, Open Graph and sitemap URLs).'
	},
	PUBLIC_SANITY_PROJECT_ID: {
		public: true,
		static: true,
		description:
			"Sanity project ID, used only to build image URLs on Sanity's public CDN. Blank in local dev."
	},
	PUBLIC_SANITY_DATASET: {
		public: true,
		static: true,
		// Optional: src/lib/sanity.ts falls back to `production`.
		schema: (value) => value,
		description: 'Sanity dataset for image URLs (default `production`).'
	}
});

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { missingProductionEnv } from './src/lib/build-env';

export default defineConfig(({ command, mode }) => {
	// A production build never reads the committed .env.development, so
	// without PUBLIC_* in the environment SvelteKit fails with an opaque
	// "not exported by virtual:env/static/public" error. Fail early with
	// a clear one instead. deploy-frontend.yml sets these from repo vars.
	if (command === 'build' && mode === 'production') {
		const missing = missingProductionEnv({ ...loadEnv(mode, process.cwd(), 'PUBLIC_'), ...process.env });
		if (missing.length > 0) {
			throw new Error(
				`Production build is missing ${missing.join(', ')}. Set them in the environment (CI does) or in a gitignored frontend/.env.production.local. For a local build with the dev defaults, run \`pnpm frontend build --mode development\`.`
			);
		}
	}
	return { plugins: [sveltekit()] };
});

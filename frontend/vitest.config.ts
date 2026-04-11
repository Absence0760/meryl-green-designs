import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so the SvelteKit plugin (which needs a full
// dev-server lifecycle) isn't pulled into the Vitest runtime. Tests that
// touch SvelteKit virtual modules like `$env/static/public` mock them with
// `vi.mock()` instead.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});

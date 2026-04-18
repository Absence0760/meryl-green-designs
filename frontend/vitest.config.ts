import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so the SvelteKit plugin (which needs a full
// dev-server lifecycle) isn't pulled into the Vitest runtime. Tests that
// touch SvelteKit virtual modules like `$env/static/public` mock them with
// `vi.mock()` instead. Pure logic that needs to be tested should live in
// plain `.ts` files; `.svelte` and `.svelte.ts` rune modules can't be
// compiled here without the svelte plugin (which conflicts with vitest's
// bundled Vite version), so they wrap the testable logic.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});

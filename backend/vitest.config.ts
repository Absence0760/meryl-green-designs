import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Env vars set once for every test file. Individual tests can override
		// via vi.stubEnv() if they need to exercise a missing-env code path.
		setupFiles: ['./src/__tests__/setup.ts'],
		// Don't pick up the dist/ folder from previous builds.
		exclude: ['node_modules/**', 'dist/**'],
		include: ['src/**/*.test.ts']
	}
});

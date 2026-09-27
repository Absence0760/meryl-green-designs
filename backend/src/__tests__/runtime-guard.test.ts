import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	assertNoDevConfigOnLambda,
	DEV_ADMIN_API_TOKEN,
	findDevOnlyConfig
} from '../runtime-guard.js';
import { createApp } from '../app.js';

const LAMBDA = { AWS_LAMBDA_FUNCTION_NAME: 'meryl-green-designs-backend' };

describe('assertNoDevConfigOnLambda', () => {
	it('is a no-op off Lambda, even with every dev setting on', () => {
		expect(() =>
			assertNoDevConfigOnLambda({
				CONTENT_BACKEND: 'local',
				EMAIL_BACKEND: 'file',
				ADMIN_API_TOKEN: DEV_ADMIN_API_TOKEN
			})
		).not.toThrow();
	});

	it('passes on Lambda with production-shaped config', () => {
		expect(() =>
			assertNoDevConfigOnLambda({ ...LAMBDA, ADMIN_API_TOKEN: 'a'.repeat(64) })
		).not.toThrow();
		expect(() =>
			assertNoDevConfigOnLambda({ ...LAMBDA, CONTENT_BACKEND: 'sanity', EMAIL_BACKEND: 'resend' })
		).not.toThrow();
	});

	it.each([
		[{ CONTENT_BACKEND: 'local' }, /CONTENT_BACKEND=local/],
		[{ CONTENT_BACKEND: ' LOCAL ' }, /CONTENT_BACKEND=local/],
		[{ EMAIL_BACKEND: 'file' }, /EMAIL_BACKEND=file/],
		[{ ADMIN_API_TOKEN: DEV_ADMIN_API_TOKEN }, /ADMIN_API_TOKEN/]
	])('throws on Lambda with %o', (env, message) => {
		expect(() => assertNoDevConfigOnLambda({ ...LAMBDA, ...env })).toThrow(message);
	});

	it('lists every problem at once', () => {
		expect(
			findDevOnlyConfig({
				CONTENT_BACKEND: 'local',
				EMAIL_BACKEND: 'file',
				ADMIN_API_TOKEN: DEV_ADMIN_API_TOKEN
			})
		).toHaveLength(3);
	});
});

describe('createApp on Lambda', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('refuses to build the app with local-dev config', () => {
		vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'meryl-green-designs-backend');
		vi.stubEnv('CONTENT_BACKEND', 'local');
		expect(() => createApp()).toThrow(/Refusing to start on Lambda/);
	});

	it('builds normally on Lambda with production-shaped config', () => {
		vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'meryl-green-designs-backend');
		expect(() => createApp()).not.toThrow();
	});
});

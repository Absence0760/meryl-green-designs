import { describe, it, expect } from 'vitest';
import { assertSafeForRealAws } from '../dynamo.js';

describe('assertSafeForRealAws', () => {
	it('passes when DYNAMODB_ENDPOINT is set (local dev / tests)', () => {
		expect(() =>
			assertSafeForRealAws({ DYNAMODB_ENDPOINT: 'http://localhost:8000' })
		).not.toThrow();
	});

	it('passes when running inside Lambda (AWS_LAMBDA_FUNCTION_NAME set)', () => {
		// The Lambda runtime sets this automatically; this is the prod
		// happy-path the assertion is designed not to interfere with.
		expect(() =>
			assertSafeForRealAws({ AWS_LAMBDA_FUNCTION_NAME: 'meryl-green-designs-backend' })
		).not.toThrow();
	});

	it('passes when ALLOW_REAL_AWS=1 is set (script --prod opt-in)', () => {
		expect(() => assertSafeForRealAws({ ALLOW_REAL_AWS: '1' })).not.toThrow();
	});

	it('throws when neither endpoint, Lambda env, nor explicit opt-in is present', () => {
		// The "pnpm backend dev with a misconfigured .env" case — exactly
		// the path the assertion exists to block.
		expect(() => assertSafeForRealAws({})).toThrow(
			/Refusing to connect to real AWS DynamoDB/
		);
	});

	it('does NOT honour ALLOW_REAL_AWS values other than the literal "1"', () => {
		// Conservative match: a stray "yes" / "true" / "0" should not
		// inadvertently enable prod writes.
		expect(() => assertSafeForRealAws({ ALLOW_REAL_AWS: 'yes' })).toThrow();
		expect(() => assertSafeForRealAws({ ALLOW_REAL_AWS: 'true' })).toThrow();
		expect(() => assertSafeForRealAws({ ALLOW_REAL_AWS: '0' })).toThrow();
		expect(() => assertSafeForRealAws({ ALLOW_REAL_AWS: '' })).toThrow();
	});

	it('treats whitespace-only DYNAMODB_ENDPOINT as unset', () => {
		expect(() =>
			assertSafeForRealAws({ DYNAMODB_ENDPOINT: '   ' })
		).toThrow(/Refusing to connect/);
	});
});

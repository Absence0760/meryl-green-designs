import { describe, it, expect } from 'vitest';
import { missingProductionEnv } from './build-env';

describe('missingProductionEnv', () => {
	it('lists every required PUBLIC_* key that is unset or blank', () => {
		expect(missingProductionEnv({ PUBLIC_API_URL: 'https://x/api', PUBLIC_SITE_URL: '  ' })).toEqual([
			'PUBLIC_SITE_URL',
			'PUBLIC_SANITY_PROJECT_ID'
		]);
	});

	it('passes when the deploy workflow provides them', () => {
		expect(
			missingProductionEnv({
				PUBLIC_API_URL: 'https://merylgreendesigns.com/api',
				PUBLIC_SITE_URL: 'https://merylgreendesigns.com',
				PUBLIC_SANITY_PROJECT_ID: 'abc123'
			})
		).toEqual([]);
	});
});

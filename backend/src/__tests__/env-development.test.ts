import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { DEV_ADMIN_API_TOKEN, findDevOnlyConfig } from '../runtime-guard.js';

// Guards the COMMITTED .env.development files (backend, frontend, studio).
// This repo is public, so they may only hold non-sensitive local-dev
// defaults. Real secrets belong in the gitignored .env.development.local or
// the private infra-secrets repo.

const repoRoot = resolve(__dirname, '../../..');
function load(workspace: string): Record<string, string> {
	return parse(readFileSync(resolve(repoRoot, workspace, '.env.development'), 'utf8'));
}

const files = {
	backend: load('backend'),
	frontend: load('frontend'),
	studio: load('studio')
};

// Keys whose value is always a real secret: must stay blank in the
// committed file.
const SECRET_KEYS = ['RESEND_API_KEY', 'SANITY_API_TOKEN', 'SANITY_WEBHOOK_SECRET'];

// Public, documented non-secret values allowed despite looking token-ish.
const ALLOWED_VALUES = new Set([
	DEV_ADMIN_API_TOKEN,
	'10004002', // PayFast public sandbox merchant id
	'q1cd2rdny4a53', // PayFast public sandbox merchant key
	'payfast' // PayFast public sandbox passphrase
]);

const SECRET_SHAPES = [
	/^re_[A-Za-z0-9_]{8,}/, // Resend
	/^sk[A-Za-z0-9]{20,}/, // Sanity API tokens
	/^(AKIA|ASIA)[A-Z0-9]{12,}/, // AWS access key ids
	/^gh[pousr]_[A-Za-z0-9]{20,}/, // GitHub tokens
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
	/^[A-Fa-f0-9]{32,}$/, // hex secrets (openssl rand -hex)
	/^[A-Za-z0-9+/_-]{32,}={0,2}$/ // long base64/opaque tokens
];

describe('committed .env.development files', () => {
	it.each(Object.entries(files))('%s: no value looks like a secret', (_name, env) => {
		for (const [key, value] of Object.entries(env)) {
			if (ALLOWED_VALUES.has(value)) continue;
			for (const shape of SECRET_SHAPES) {
				expect(shape.test(value), `${key} looks like a secret (${shape})`).toBe(false);
			}
		}
	});

	it('backend: secret-bearing keys are blank', () => {
		for (const key of SECRET_KEYS) expect(files.backend[key] ?? '').toBe('');
	});

	it('backend: runs fully offline, and is exactly what the Lambda guard rejects', () => {
		expect(files.backend).toMatchObject({
			CONTENT_BACKEND: 'local',
			EMAIL_BACKEND: 'file',
			DYNAMODB_ENDPOINT: 'http://localhost:4566',
			PAYFAST_SANDBOX: 'true',
			PAYFAST_MERCHANT_ID: '10004002',
			ADMIN_API_TOKEN: DEV_ADMIN_API_TOKEN
		});
		expect(findDevOnlyConfig(files.backend)).toHaveLength(3);
	});

	it('only points at loopback URLs', () => {
		for (const env of Object.values(files)) {
			for (const [key, value] of Object.entries(env)) {
				if (/^https?:\/\//.test(value)) {
					expect(`${key}=${new URL(value).hostname}`).toBe(`${key}=localhost`);
				}
			}
		}
	});

	it('studio admin token matches the backend', () => {
		expect(files.studio.SANITY_STUDIO_ADMIN_TOKEN).toBe(files.backend.ADMIN_API_TOKEN);
	});

	it('frontend: defines every PUBLIC_* key $env/static/public imports', () => {
		for (const key of [
			'PUBLIC_API_URL',
			'PUBLIC_SITE_URL',
			'PUBLIC_SANITY_PROJECT_ID',
			'PUBLIC_SANITY_DATASET'
		]) {
			expect(files.frontend).toHaveProperty(key);
		}
	});
});

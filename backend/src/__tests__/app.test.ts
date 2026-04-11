import { describe, it, expect, vi } from 'vitest';

vi.mock('../sanity.js', () => ({
	createOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	getProducts: vi.fn().mockResolvedValue([]),
	getGalleryPhotos: vi.fn().mockResolvedValue([])
}));
vi.mock('../email.js', async () => {
	const actual = await vi.importActual<typeof import('../email.js')>('../email.js');
	return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});

import { createApp } from '../app.js';

describe('GET /health', () => {
	it('returns {ok: true}', async () => {
		const app = createApp();
		const res = await app.request('/health');
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual({ ok: true });
	});
});

describe('CORS', () => {
	it('allows requests from an origin in ALLOWED_ORIGINS', async () => {
		const app = createApp();
		const res = await app.request('/health', {
			headers: { Origin: 'http://localhost:7777' }
		});
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:7777');
	});

	it('allows the production domain (in ALLOWED_ORIGINS)', async () => {
		const app = createApp();
		const res = await app.request('/health', {
			headers: { Origin: 'https://merylgreendesigns.co.za' }
		});
		expect(res.headers.get('access-control-allow-origin')).toBe(
			'https://merylgreendesigns.co.za'
		);
	});

	it('does not echo back an origin that is not in the allow-list', async () => {
		const app = createApp();
		const res = await app.request('/health', {
			headers: { Origin: 'https://evil.example' }
		});
		// Hono's cors() returns the header only for allowed origins. For
		// disallowed origins the header is absent (browsers will then block
		// the request).
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('responds to an OPTIONS preflight for an allowed origin', async () => {
		const app = createApp();
		const res = await app.request('/orders', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:7777',
				'Access-Control-Request-Method': 'POST',
				'Access-Control-Request-Headers': 'content-type'
			}
		});
		expect(res.status).toBeLessThan(300);
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:7777');
		expect(res.headers.get('access-control-allow-methods')?.toUpperCase()).toContain('POST');
	});
});

describe('error handling', () => {
	it('returns 404 for unknown routes', async () => {
		const app = createApp();
		const res = await app.request('/does-not-exist');
		expect(res.status).toBe(404);
	});
});

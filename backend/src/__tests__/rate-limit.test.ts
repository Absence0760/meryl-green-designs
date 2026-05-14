import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createRateLimiter, getClientIp } from '../rate-limit.js';

// Integration tests below need createApp + the same mocks as the rest of
// the suite. Hoisted vi.mock() calls run before imports.
vi.mock('../email.js', async () => {
	const actual = await vi.importActual<typeof import('../email.js')>('../email.js');
	return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});
vi.mock('../sanity.js', () => ({
	createOrder: vi.fn(),
	getOrderByRef: vi.fn(),
	getProducts: vi.fn(),
	getGalleryPhotos: vi.fn(),
	getProductsByIds: vi.fn(),
	updateOrderPayment: vi.fn()
}));

import { createApp } from '../app.js';

function makeApp(opts: { windowMs: number; max: number }) {
	const app = new Hono();
	app.use('/limited/*', createRateLimiter(opts));
	app.get('/limited/probe', (c) => c.json({ ok: true }));
	return app;
}

function req(app: Hono, ip = '203.0.113.1') {
	return app.request('/limited/probe', {
		headers: { 'x-forwarded-for': ip }
	});
}

describe('createRateLimiter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows requests up to the limit then returns 429', async () => {
		const app = makeApp({ windowMs: 60_000, max: 3 });

		const ok1 = await req(app);
		const ok2 = await req(app);
		const ok3 = await req(app);
		const blocked = await req(app);

		expect(ok1.status).toBe(200);
		expect(ok2.status).toBe(200);
		expect(ok3.status).toBe(200);
		expect(blocked.status).toBe(429);
		const body = (await blocked.json()) as { error: string };
		expect(body.error).toMatch(/too many/i);
	});

	it('sets a Retry-After header on 429 responses', async () => {
		const app = makeApp({ windowMs: 60_000, max: 1 });

		await req(app);
		const blocked = await req(app);

		expect(blocked.status).toBe(429);
		const retryAfter = blocked.headers.get('Retry-After');
		expect(retryAfter).not.toBeNull();
		expect(Number(retryAfter)).toBeGreaterThan(0);
		expect(Number(retryAfter)).toBeLessThanOrEqual(60);
	});

	it('isolates buckets per client IP', async () => {
		const app = makeApp({ windowMs: 60_000, max: 2 });

		// IP A burns through its quota.
		await req(app, '198.51.100.10');
		await req(app, '198.51.100.10');
		const blockedA = await req(app, '198.51.100.10');
		expect(blockedA.status).toBe(429);

		// IP B is independent and still allowed.
		const okB = await req(app, '198.51.100.11');
		expect(okB.status).toBe(200);
	});

	it('resets the bucket after the window elapses', async () => {
		const app = makeApp({ windowMs: 60_000, max: 1 });

		const ok = await req(app);
		expect(ok.status).toBe(200);

		const blocked = await req(app);
		expect(blocked.status).toBe(429);

		vi.advanceTimersByTime(60_001);

		const okAgain = await req(app);
		expect(okAgain.status).toBe(200);
	});

	it('uses the first IP from a comma-separated x-forwarded-for', async () => {
		const app = makeApp({ windowMs: 60_000, max: 1 });

		// Same client IP, different intermediaries — should still share a bucket.
		const ok = await app.request('/limited/probe', {
			headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' }
		});
		const blocked = await app.request('/limited/probe', {
			headers: { 'x-forwarded-for': '203.0.113.5, 192.168.1.1' }
		});

		expect(ok.status).toBe(200);
		expect(blocked.status).toBe(429);
	});

	it('groups all unidentifiable clients into a single bucket', async () => {
		const app = makeApp({ windowMs: 60_000, max: 2 });

		// No x-forwarded-for, no x-real-ip — all "unknown".
		const a = await app.request('/limited/probe');
		const b = await app.request('/limited/probe');
		const c = await app.request('/limited/probe');

		expect(a.status).toBe(200);
		expect(b.status).toBe(200);
		expect(c.status).toBe(429);
	});

	it('short-circuits to pass-through when RATE_LIMIT_DISABLED=true', async () => {
		vi.stubEnv('RATE_LIMIT_DISABLED', 'true');
		try {
			// makeApp constructs the limiter — the env-flag check happens
			// at construction, so this app gets the pass-through.
			const app = makeApp({ windowMs: 60_000, max: 1 });

			// 10 requests, far over the max of 1. None should be blocked.
			for (let i = 0; i < 10; i++) {
				const res = await app.request('/limited/probe');
				expect(res.status).toBe(200);
			}
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('still rate-limits when RATE_LIMIT_DISABLED is anything other than "true"', async () => {
		// Defence-in-depth: only the exact string 'true' bypasses; '1',
		// 'yes', empty string, etc. all leave the limiter active so a
		// typo in a deployed env var can't silently open the limiter.
		for (const val of ['1', 'yes', 'TRUE', '', 'false']) {
			vi.stubEnv('RATE_LIMIT_DISABLED', val);
			try {
				const app = makeApp({ windowMs: 60_000, max: 1 });
				const ok = await app.request('/limited/probe');
				const blocked = await app.request('/limited/probe');
				expect(ok.status).toBe(200);
				expect(blocked.status).toBe(429);
			} finally {
				vi.unstubAllEnvs();
			}
		}
	});
});

describe('rate limiter integration', () => {
	it('enforces a 429 on POST /orders after the per-IP limit', async () => {
		// Limit is 5/15min — issue 6 requests from one IP. The validation
		// check fails fast with 400 (no real body), but rate-limiter middleware
		// runs first, so 6th request must be 429.
		const app = createApp();
		const ip = '203.0.113.42';
		const headers = {
			'Content-Type': 'application/json',
			'x-forwarded-for': ip
		};
		const body = JSON.stringify({});

		for (let i = 0; i < 5; i++) {
			const res = await app.request('/orders', { method: 'POST', headers, body });
			expect(res.status).not.toBe(429);
		}

		const sixth = await app.request('/orders', { method: 'POST', headers, body });
		expect(sixth.status).toBe(429);
	});

	it('enforces a 429 on GET /orders/:ref after the per-IP limit', async () => {
		const app = createApp();
		const ip = '203.0.113.43';
		const headers = { 'x-forwarded-for': ip };

		for (let i = 0; i < 20; i++) {
			const res = await app.request(`/orders/MG-260410-AAAA?email=test@example.com`, {
				headers
			});
			expect(res.status).not.toBe(429);
		}

		const overLimit = await app.request(`/orders/MG-260410-AAAA?email=test@example.com`, {
			headers
		});
		expect(overLimit.status).toBe(429);
	});
});

describe('getClientIp', () => {
	it('extracts the first IP from x-forwarded-for', () => {
		const c = {
			req: {
				header: (name: string) =>
					name === 'x-forwarded-for' ? '203.0.113.10, 10.0.0.1' : undefined
			}
		};
		expect(getClientIp(c as never)).toBe('203.0.113.10');
	});

	it('falls back to x-real-ip when x-forwarded-for is missing', () => {
		const c = {
			req: {
				header: (name: string) => (name === 'x-real-ip' ? '203.0.113.20' : undefined)
			}
		};
		expect(getClientIp(c as never)).toBe('203.0.113.20');
	});

	it('returns "unknown" when no IP headers are present', () => {
		const c = { req: { header: () => undefined } };
		expect(getClientIp(c as never)).toBe('unknown');
	});
});

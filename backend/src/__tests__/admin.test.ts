import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../orders-store.js', () => ({
	getOrderPii: vi.fn(),
	updateOrderTracking: vi.fn(),
	updateOrderInternalNotes: vi.fn()
}));

import { createApp } from '../app.js';
import * as ordersStore from '../orders-store.js';
import type { OrderPii } from '../orders-store.js';

function piiRow(overrides: Partial<OrderPii> = {}): OrderPii {
	return {
		orderRef: 'MG-260410-ABCD',
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: '0123456789',
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen — R 450.00',
		customerNotes: 'Please gift wrap',
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		internalNotes: null,
		createdAt: '2026-04-10T12:00:00Z',
		ttl: Math.floor(Date.parse('2026-04-10T12:00:00Z') / 1000) + 365 * 24 * 60 * 60,
		...overrides
	};
}

function authHeader(token = 'test-admin-token'): Record<string, string> {
	return { Authorization: `Bearer ${token}` };
}

describe('admin auth middleware', () => {
	beforeEach(() => {
		// Reset call history between tests — the "allows through when token
		// matches" case lets the mock fire, and subsequent tests assert the
		// mock was NOT called, which fails if we don't clear here.
		vi.mocked(ordersStore.getOrderPii).mockReset().mockResolvedValue(piiRow());
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns 401 when the Authorization header is missing', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD');
		expect(res.status).toBe(401);
		expect(ordersStore.getOrderPii).not.toHaveBeenCalled();
	});

	it('returns 401 when the header is not a Bearer token', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: { Authorization: 'Basic dXNlcjpwYXNz' }
		});
		expect(res.status).toBe(401);
	});

	it('returns 401 when the token is the wrong value', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader('not-the-right-one')
		});
		expect(res.status).toBe(401);
		expect(ordersStore.getOrderPii).not.toHaveBeenCalled();
	});

	it('returns 401 when the provided token differs only in length (constant-time guard)', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader('test-admin-token-extra')
		});
		expect(res.status).toBe(401);
	});

	it('tolerates trailing whitespace on the configured token (SOPS / heredoc safety)', async () => {
		// SOPS-decrypted values commonly carry a trailing newline. The
		// middleware trims both sides so this does not become a silent 401.
		vi.stubEnv('ADMIN_API_TOKEN', 'test-admin-token\n');
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader('test-admin-token')
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});

	it('rejects an all-whitespace ADMIN_API_TOKEN (closes empty-buffer bypass)', async () => {
		// Without the trim-then-empty-check, a misconfigured token like "\n"
		// would pass the `!expected` guard, trim to empty, and timingSafeEqual
		// two zero-length buffers — granting access to any client sending an
		// empty `Bearer  ` value. Now both sides are normalised before the
		// emptiness check.
		vi.stubEnv('ADMIN_API_TOKEN', '\n');
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: { Authorization: 'Bearer   ' }
		});
		expect(res.status).toBe(500); // server-misconfig fail-closed
		expect(ordersStore.getOrderPii).not.toHaveBeenCalled();
		vi.unstubAllEnvs();
	});

	it('rejects an empty-after-trim Bearer token even when ADMIN_API_TOKEN is set', async () => {
		// `Authorization: Bearer  ` (header trimmed to nothing) must not
		// satisfy a real configured token via the zero-length-buffer
		// path. The regex captures the trailing whitespace, then the
		// post-trim empty check returns 401 before timingSafeEqual runs.
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: { Authorization: 'Bearer   ' }
		});
		expect(res.status).toBe(401);
		expect(ordersStore.getOrderPii).not.toHaveBeenCalled();
	});

	it('returns 500 when ADMIN_API_TOKEN is not configured', async () => {
		vi.stubEnv('ADMIN_API_TOKEN', '');
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader()
		});
		expect(res.status).toBe(500);
		vi.unstubAllEnvs();
	});

	it('allows the request through when the token matches', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader()
		});
		expect(res.status).toBe(200);
		expect(ordersStore.getOrderPii).toHaveBeenCalledWith('MG-260410-ABCD');
	});
});

describe('GET /admin/orders/:ref', () => {
	beforeEach(() => {
		vi.mocked(ordersStore.getOrderPii).mockReset();
	});

	it('returns the PII row for an existing order', async () => {
		const row = piiRow();
		vi.mocked(ordersStore.getOrderPii).mockResolvedValueOnce(row);
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader()
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as OrderPii;
		expect(body.orderRef).toBe('MG-260410-ABCD');
		expect(body.customerName).toBe('Jane Smith');
		expect(body.customerEmail).toBe('jane@example.com');
	});

	it('returns 404 when no row exists for that orderRef', async () => {
		vi.mocked(ordersStore.getOrderPii).mockResolvedValueOnce(null);
		const app = createApp();
		const res = await app.request('/admin/orders/MG-000000-XXXX', {
			headers: authHeader()
		});
		expect(res.status).toBe(404);
	});

	it('returns 500 when DynamoDB throws', async () => {
		vi.mocked(ordersStore.getOrderPii).mockRejectedValueOnce(new Error('throttled'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			headers: authHeader()
		});
		expect(res.status).toBe(500);
		errSpy.mockRestore();
	});
});

describe('PATCH /admin/orders/:ref/tracking', () => {
	beforeEach(() => {
		vi.mocked(ordersStore.updateOrderTracking).mockReset().mockResolvedValue();
	});

	it('writes the supplied tracking fields and returns 200', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD/tracking', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: JSON.stringify({
				trackingNumber: 'CG-12345',
				trackingUrl: 'https://example.com/track/CG-12345',
				shippingCarrier: 'Courier Guy'
			})
		});
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderTracking).toHaveBeenCalledWith('MG-260410-ABCD', {
			trackingNumber: 'CG-12345',
			trackingUrl: 'https://example.com/track/CG-12345',
			shippingCarrier: 'Courier Guy'
		});
	});

	it('treats an empty string as a clear (null)', async () => {
		const app = createApp();
		await app.request('/admin/orders/MG-260410-ABCD/tracking', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ trackingNumber: '' })
		});
		expect(ordersStore.updateOrderTracking).toHaveBeenCalledWith('MG-260410-ABCD', {
			trackingNumber: null
		});
	});

	it('only forwards keys the body explicitly mentions (sparse PATCH)', async () => {
		const app = createApp();
		await app.request('/admin/orders/MG-260410-ABCD/tracking', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ shippingCarrier: 'Aramex' })
		});
		expect(ordersStore.updateOrderTracking).toHaveBeenCalledWith('MG-260410-ABCD', {
			shippingCarrier: 'Aramex'
		});
	});

	it('rejects a non-string non-null value with 400', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD/tracking', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ trackingNumber: 12345 })
		});
		expect(res.status).toBe(400);
		expect(ordersStore.updateOrderTracking).not.toHaveBeenCalled();
	});

	it('rejects invalid JSON with 400', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD/tracking', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: 'not-json'
		});
		expect(res.status).toBe(400);
	});

	it('still requires auth', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD/tracking', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ trackingNumber: 'X' })
		});
		expect(res.status).toBe(401);
		expect(ordersStore.updateOrderTracking).not.toHaveBeenCalled();
	});
});

describe('PATCH /admin/orders/:ref/internal-notes', () => {
	beforeEach(() => {
		vi.mocked(ordersStore.updateOrderInternalNotes).mockReset().mockResolvedValue();
	});

	it('writes the supplied notes and returns 200', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD/internal-notes', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ internalNotes: 'sent reminder 2026-05-01' })
		});
		expect(res.status).toBe(200);
		expect(ordersStore.updateOrderInternalNotes).toHaveBeenCalledWith(
			'MG-260410-ABCD',
			'sent reminder 2026-05-01'
		);
	});

	it('coerces null/empty/undefined to null (clear)', async () => {
		const app = createApp();
		for (const body of [{ internalNotes: null }, { internalNotes: '' }, {}]) {
			vi.mocked(ordersStore.updateOrderInternalNotes).mockClear();
			await app.request('/admin/orders/MG-260410-ABCD/internal-notes', {
				method: 'PATCH',
				headers: { ...authHeader(), 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			expect(ordersStore.updateOrderInternalNotes).toHaveBeenCalledWith(
				'MG-260410-ABCD',
				null
			);
		}
	});

	it('rejects a non-string non-null with 400', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD/internal-notes', {
			method: 'PATCH',
			headers: { ...authHeader(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ internalNotes: { not: 'a string' } })
		});
		expect(res.status).toBe(400);
		expect(ordersStore.updateOrderInternalNotes).not.toHaveBeenCalled();
	});
});

describe('CORS scoping for /admin/*', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('echoes the Studio origin back on a preflight from STUDIO_ORIGINS', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:3333',
				'Access-Control-Request-Method': 'GET'
			}
		});
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3333');
	});

	it('does NOT echo a public-frontend origin back to /admin/*', async () => {
		const app = createApp();
		const res = await app.request('/admin/orders/MG-260410-ABCD', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:7777',
				'Access-Control-Request-Method': 'GET'
			}
		});
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('uses admin-scope CORS for the bare /admin path (no trailing slash)', async () => {
		// Defends against prefix-collision regressions where startsWith
		// could fall through to the public-CORS origin list.
		const app = createApp();
		const res = await app.request('/admin', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:3333',
				'Access-Control-Request-Method': 'GET'
			}
		});
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3333');
	});

	it('does NOT treat a prefix-collision route like /admintools as admin-scope', async () => {
		// Origin is allowed by the public-CORS list (localhost:7777) but
		// not by the admin list. If the path check were `startsWith('/admin')`
		// without the trailing-slash/end anchor, this preflight would be
		// admin-scoped and rejected; we want it public-scoped and accepted.
		const app = createApp();
		const res = await app.request('/admintools/whatever', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:7777',
				'Access-Control-Request-Method': 'GET'
			}
		});
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:7777');
	});
});

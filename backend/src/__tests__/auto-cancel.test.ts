import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SanityClient } from '@sanity/client';
import {
	autoCancelStaleOrders,
	getCutoffIso,
	findStalePendingOrders,
	cancelOrder,
	type StalePendingOrder
} from '../auto-cancel.js';

// Alias for the cast target — keeps the call sites short and reads more
// honestly than `Parameters<...>[0]['client']`.
type SanityClientLike = SanityClient;

// Minimal Sanity client shape — only the methods the auto-cancel logic
// touches. Typed as the surface we actually use rather than the full
// @sanity/client interface so the mock stays readable.
type MockClient = {
	fetch: ReturnType<typeof vi.fn>;
	patch: ReturnType<typeof vi.fn>;
};

function makeMockClient(): MockClient {
	// patch(docId).set(...).commit() — three-step builder. Each stage
	// returns the next, terminating in a commit() that resolves to {}.
	const patchCommit = vi.fn().mockResolvedValue({});
	const patchSet = vi.fn(() => ({ commit: patchCommit }));
	const patch = vi.fn(() => ({ set: patchSet }));
	return {
		fetch: vi.fn(),
		patch
	};
}

function stale(overrides: Partial<StalePendingOrder> = {}): StalePendingOrder {
	return {
		_id: 'doc-1',
		orderRef: 'MG-OLD-AAAA',
		_createdAt: '2026-01-01T00:00:00Z',
		...overrides
	};
}

describe('getCutoffIso', () => {
	it('subtracts the requested days from `now`', () => {
		const now = new Date('2026-05-14T12:00:00Z');
		const cutoff = getCutoffIso(now, 30);
		expect(cutoff).toBe('2026-04-14T12:00:00.000Z');
	});

	it('handles zero days as "now" (no margin) — sanity guard', () => {
		const now = new Date('2026-05-14T12:00:00Z');
		expect(getCutoffIso(now, 0)).toBe('2026-05-14T12:00:00.000Z');
	});
});

describe('findStalePendingOrders', () => {
	it('queries Sanity with status, type and createdAt cutoff', async () => {
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([]);
		await findStalePendingOrders(
			client as unknown as SanityClientLike,
			'2026-04-14T12:00:00.000Z'
		);
		const [query, params] = client.fetch.mock.calls[0]!;
		expect(query).toContain('_type == "order"');
		expect(query).toContain('status == "pending_payment"');
		expect(query).toContain('_createdAt < $cutoff');
		expect(params).toEqual({ cutoff: '2026-04-14T12:00:00.000Z' });
	});

	it('returns the projected fields from Sanity', async () => {
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([stale({ orderRef: 'MG-OLD-X' })]);
		const result = await findStalePendingOrders(
			client as unknown as Parameters<typeof findStalePendingOrders>[0],
			'cutoff-iso'
		);
		expect(result).toEqual([stale({ orderRef: 'MG-OLD-X' })]);
	});
});

describe('cancelOrder', () => {
	it('patches the document with status=cancelled', async () => {
		const client = makeMockClient();
		await cancelOrder(client as unknown as SanityClientLike, 'doc-1');
		expect(client.patch).toHaveBeenCalledWith('doc-1');
		const setMock = client.patch.mock.results[0]!.value.set;
		expect(setMock).toHaveBeenCalledWith({ status: 'cancelled' });
	});
});

describe('autoCancelStaleOrders', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('finds zero, returns zero, never patches', async () => {
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([]);
		const result = await autoCancelStaleOrders({
			client: client as unknown as SanityClientLike,
			now: new Date('2026-05-14T12:00:00Z'),
			days: 30
		});
		expect(result).toEqual({
			cutoffIso: '2026-04-14T12:00:00.000Z',
			found: 0,
			cancelled: 0,
			failed: 0
		});
		expect(client.patch).not.toHaveBeenCalled();
	});

	it('cancels every stale order returned by the query', async () => {
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([
			stale({ _id: 'a', orderRef: 'MG-A' }),
			stale({ _id: 'b', orderRef: 'MG-B' }),
			stale({ _id: 'c', orderRef: 'MG-C' })
		]);
		const result = await autoCancelStaleOrders({
			client: client as unknown as SanityClientLike,
			now: new Date('2026-05-14T12:00:00Z'),
			days: 30
		});
		expect(result.found).toBe(3);
		expect(result.cancelled).toBe(3);
		expect(result.failed).toBe(0);
		expect(client.patch).toHaveBeenCalledTimes(3);
		expect(client.patch).toHaveBeenNthCalledWith(1, 'a');
		expect(client.patch).toHaveBeenNthCalledWith(2, 'b');
		expect(client.patch).toHaveBeenNthCalledWith(3, 'c');
	});

	it('keeps going if one cancel fails — partial success is the expected mode', async () => {
		// A single transient Sanity error shouldn't abandon the rest of the
		// batch. The next scheduled run picks up the survivors.
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([
			stale({ _id: 'a', orderRef: 'MG-A' }),
			stale({ _id: 'b', orderRef: 'MG-B' })
		]);
		const patchCommit = vi
			.fn()
			.mockRejectedValueOnce(new Error('rate limited'))
			.mockResolvedValueOnce({});
		const patchSet = vi.fn(() => ({ commit: patchCommit }));
		client.patch.mockImplementation(() => ({ set: patchSet }));

		const result = await autoCancelStaleOrders({
			client: client as unknown as SanityClientLike,
			now: new Date('2026-05-14T12:00:00Z'),
			days: 30
		});
		expect(result.found).toBe(2);
		expect(result.cancelled).toBe(1);
		expect(result.failed).toBe(1);
	});

	it('uses AUTO_CANCEL_DAYS env override when no days option passed', async () => {
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([]);
		vi.stubEnv('AUTO_CANCEL_DAYS', '7');
		try {
			const result = await autoCancelStaleOrders({
				client: client as unknown as SanityClientLike,
				now: new Date('2026-05-14T12:00:00Z')
			});
			// 7 days back from 2026-05-14 = 2026-05-07
			expect(result.cutoffIso).toBe('2026-05-07T12:00:00.000Z');
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('falls back to 30 days for unparseable or non-positive AUTO_CANCEL_DAYS', async () => {
		const client = makeMockClient();
		client.fetch.mockResolvedValueOnce([]);
		vi.stubEnv('AUTO_CANCEL_DAYS', 'banana');
		try {
			const result = await autoCancelStaleOrders({
				client: client as unknown as SanityClientLike,
				now: new Date('2026-05-14T12:00:00Z')
			});
			expect(result.cutoffIso).toBe('2026-04-14T12:00:00.000Z');
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

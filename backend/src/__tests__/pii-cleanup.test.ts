import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sanity.js', () => ({
	findOrdersWithExpiredPii: vi.fn(),
	clearOrderPii: vi.fn()
}));

import { runPiiCleanup } from '../pii-cleanup.js';
import * as sanity from '../sanity.js';

beforeEach(() => {
	vi.mocked(sanity.findOrdersWithExpiredPii).mockReset();
	vi.mocked(sanity.clearOrderPii).mockReset();
});

describe('runPiiCleanup', () => {
	const FIXED_NOW = new Date('2027-04-16T12:00:00Z');
	// 365 days before FIXED_NOW
	const EXPECTED_CUTOFF = '2026-04-16T12:00:00.000Z';

	it('uses _now - 365 days as the cutoff and scrubs every eligible order', async () => {
		vi.mocked(sanity.findOrdersWithExpiredPii).mockResolvedValue([
			{ _id: 'order-1', orderRef: 'MG-260101-AAAAAA', status: 'delivered' },
			{ _id: 'order-2', orderRef: 'MG-260102-BBBBBB', status: 'cancelled' }
		]);
		vi.mocked(sanity.clearOrderPii).mockResolvedValue(undefined);

		const result = await runPiiCleanup({ now: FIXED_NOW });

		expect(sanity.findOrdersWithExpiredPii).toHaveBeenCalledWith(EXPECTED_CUTOFF);
		expect(sanity.clearOrderPii).toHaveBeenCalledTimes(2);
		expect(sanity.clearOrderPii).toHaveBeenCalledWith('order-1');
		expect(sanity.clearOrderPii).toHaveBeenCalledWith('order-2');
		expect(result).toEqual({
			cutoffIso: EXPECTED_CUTOFF,
			scanned: 2,
			cleared: 2,
			failed: []
		});
	});

	it('returns scanned=0 cleared=0 when nothing is eligible', async () => {
		vi.mocked(sanity.findOrdersWithExpiredPii).mockResolvedValue([]);

		const result = await runPiiCleanup({ now: FIXED_NOW });

		expect(sanity.clearOrderPii).not.toHaveBeenCalled();
		expect(result.scanned).toBe(0);
		expect(result.cleared).toBe(0);
		expect(result.failed).toEqual([]);
	});

	it('continues past per-order failures and reports them in failed[]', async () => {
		vi.mocked(sanity.findOrdersWithExpiredPii).mockResolvedValue([
			{ _id: 'order-1', orderRef: 'MG-260101-AAAAAA', status: 'delivered' },
			{ _id: 'order-2', orderRef: 'MG-260102-BBBBBB', status: 'cancelled' },
			{ _id: 'order-3', orderRef: 'MG-260103-CCCCCC', status: 'delivered' }
		]);
		vi.mocked(sanity.clearOrderPii)
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('Sanity timeout'))
			.mockResolvedValueOnce(undefined);

		const result = await runPiiCleanup({ now: FIXED_NOW });

		expect(sanity.clearOrderPii).toHaveBeenCalledTimes(3);
		expect(result.scanned).toBe(3);
		expect(result.cleared).toBe(2);
		expect(result.failed).toEqual([
			{ orderRef: 'MG-260102-BBBBBB', error: 'Sanity timeout' }
		]);
	});

	it('respects an explicit retentionDays override', async () => {
		vi.mocked(sanity.findOrdersWithExpiredPii).mockResolvedValue([]);

		await runPiiCleanup({ now: FIXED_NOW, retentionDays: 30 });

		// 30 days before FIXED_NOW
		expect(sanity.findOrdersWithExpiredPii).toHaveBeenCalledWith('2027-03-17T12:00:00.000Z');
	});

	it('reads RETENTION_DAYS from env when no explicit override is given', async () => {
		vi.stubEnv('RETENTION_DAYS', '90');
		vi.mocked(sanity.findOrdersWithExpiredPii).mockResolvedValue([]);

		try {
			await runPiiCleanup({ now: FIXED_NOW });
			// 90 days before FIXED_NOW
			expect(sanity.findOrdersWithExpiredPii).toHaveBeenCalledWith('2027-01-16T12:00:00.000Z');
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('coerces unparseable RETENTION_DAYS to the default rather than NaN', async () => {
		vi.stubEnv('RETENTION_DAYS', 'not-a-number');
		vi.mocked(sanity.findOrdersWithExpiredPii).mockResolvedValue([]);

		try {
			await runPiiCleanup({ now: FIXED_NOW });
			// 365 days (default) before FIXED_NOW
			expect(sanity.findOrdersWithExpiredPii).toHaveBeenCalledWith(EXPECTED_CUTOFF);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

import { describe, it, expect } from 'vitest';
import {
	isExpired,
	parseArgs,
	piiItemFromSanity,
	shouldRefusePromoting,
	type Args
} from '../scripts/backfill-orders.js';
import type { OrderPii } from '../orders-store.js';

describe('parseArgs', () => {
	it('returns false for all flags by default', () => {
		expect(parseArgs([])).toEqual({ dryRun: false, overwrite: false, prod: false });
	});

	it('detects --dry-run', () => {
		expect(parseArgs(['--dry-run']).dryRun).toBe(true);
	});

	it('detects --overwrite', () => {
		expect(parseArgs(['--overwrite']).overwrite).toBe(true);
	});

	it('detects --prod', () => {
		expect(parseArgs(['--prod']).prod).toBe(true);
	});

	it('detects multiple flags regardless of order', () => {
		expect(parseArgs(['--overwrite', '--prod', '--dry-run'])).toEqual({
			dryRun: true,
			overwrite: true,
			prod: true
		});
	});

	it('ignores unrelated argv entries', () => {
		expect(parseArgs(['node', 'script.ts', '--verbose']).dryRun).toBe(false);
	});
});

describe('shouldRefusePromoting', () => {
	const baseArgs: Args = { dryRun: false, overwrite: false, prod: false };

	it('allows local writes (DYNAMODB_ENDPOINT set)', () => {
		expect(shouldRefusePromoting(baseArgs, { DYNAMODB_ENDPOINT: 'http://localhost:8000' })).toBeNull();
	});

	it('always allows dry-run, even against real AWS', () => {
		expect(shouldRefusePromoting({ ...baseArgs, dryRun: true }, {})).toBeNull();
	});

	it('refuses non-dry writes against real AWS without --prod', () => {
		expect(shouldRefusePromoting(baseArgs, {})).toMatch(/Pass --prod/);
	});

	it('allows non-dry writes against real AWS with --prod', () => {
		expect(shouldRefusePromoting({ ...baseArgs, prod: true }, {})).toBeNull();
	});

	it('treats DYNAMODB_ENDPOINT="" as unset (whitespace-only env footgun)', () => {
		expect(shouldRefusePromoting(baseArgs, { DYNAMODB_ENDPOINT: '   ' })).toMatch(/Pass --prod/);
	});
});

describe('isExpired', () => {
	function order(ttlOffsetSec: number): OrderPii {
		const nowSec = Math.floor(Date.now() / 1000);
		return {
			orderRef: 'MG-X',
			customerName: '',
			customerEmail: '',
			customerPhone: null,
			shippingAddress: '',
			items: '',
			customerNotes: null,
			trackingNumber: null,
			trackingUrl: null,
			shippingCarrier: null,
			internalNotes: null,
			createdAt: new Date(nowSec * 1000).toISOString(),
			ttl: nowSec + ttlOffsetSec
		};
	}

	it('returns false when TTL is in the future', () => {
		expect(isExpired(order(86_400))).toBe(false);
	});

	it('returns true when TTL is already in the past', () => {
		expect(isExpired(order(-86_400))).toBe(true);
	});

	it('returns true at the exact boundary (TTL equals now)', () => {
		const nowSec = 1_800_000_000;
		const item = order(0);
		item.ttl = nowSec;
		expect(isExpired(item, nowSec)).toBe(true);
	});
});

describe('piiItemFromSanity', () => {
	const baseSanityOrder = {
		_id: 'doc-1',
		_createdAt: '2026-04-10T12:00:00Z',
		orderRef: 'MG-260410-ABCD',
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: '0123456789',
		shippingAddress: '1 Test Street\nCape Town',
		items: '1 x Small Screen — R 450.00',
		customerNotes: 'Please gift wrap',
		trackingNumber: 'CG-12345',
		trackingUrl: 'https://example.com/track/CG-12345',
		shippingCarrier: 'Courier Guy',
		internalNotes: 'aunt of Meryl, deliver early'
	};

	it('passes every field through unchanged for a fully-populated order', () => {
		const item = piiItemFromSanity(baseSanityOrder);
		expect(item.orderRef).toBe('MG-260410-ABCD');
		expect(item.customerName).toBe('Jane Smith');
		expect(item.customerEmail).toBe('jane@example.com');
		expect(item.customerPhone).toBe('0123456789');
		expect(item.shippingAddress).toBe('1 Test Street\nCape Town');
		expect(item.items).toBe('1 x Small Screen — R 450.00');
		expect(item.customerNotes).toBe('Please gift wrap');
		expect(item.trackingNumber).toBe('CG-12345');
		expect(item.trackingUrl).toBe('https://example.com/track/CG-12345');
		expect(item.shippingCarrier).toBe('Courier Guy');
		expect(item.internalNotes).toBe('aunt of Meryl, deliver early');
		expect(item.createdAt).toBe('2026-04-10T12:00:00Z');
	});

	it('computes ttl as createdAt + 365 days in unix seconds', () => {
		const item = piiItemFromSanity(baseSanityOrder);
		const createdSec = Math.floor(Date.parse('2026-04-10T12:00:00Z') / 1000);
		expect(item.ttl).toBe(createdSec + 365 * 24 * 60 * 60);
	});

	it('substitutes empty strings for null required PII fields (scrubbed orders)', () => {
		// pii-cleanup may have null-ed these on terminal orders past 365
		// days. The DynamoDB shape requires string for these fields;
		// empty is the deliberate "PII gone by design" sentinel.
		const scrubbed = {
			...baseSanityOrder,
			customerName: null,
			customerEmail: null,
			shippingAddress: null,
			items: null
		};
		const item = piiItemFromSanity(scrubbed);
		expect(item.customerName).toBe('');
		expect(item.customerEmail).toBe('');
		expect(item.shippingAddress).toBe('');
		expect(item.items).toBe('');
	});

	it('preserves nulls for optional fields (no false-positive empty strings)', () => {
		const partial = {
			...baseSanityOrder,
			customerPhone: null,
			customerNotes: null,
			trackingNumber: null,
			trackingUrl: null,
			shippingCarrier: null,
			internalNotes: null
		};
		const item = piiItemFromSanity(partial);
		expect(item.customerPhone).toBeNull();
		expect(item.customerNotes).toBeNull();
		expect(item.trackingNumber).toBeNull();
		expect(item.trackingUrl).toBeNull();
		expect(item.shippingCarrier).toBeNull();
		expect(item.internalNotes).toBeNull();
	});

	it('throws on an invalid _createdAt timestamp', () => {
		expect(() =>
			piiItemFromSanity({ ...baseSanityOrder, _createdAt: 'not-a-date' })
		).toThrow(/invalid _createdAt/);
	});
});

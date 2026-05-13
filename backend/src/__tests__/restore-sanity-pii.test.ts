import { describe, it, expect } from 'vitest';
import {
	buildPatchFromPii,
	parseArgs
} from '../scripts/restore-sanity-pii.js';
import type { OrderPii } from '../orders-store.js';

describe('parseArgs', () => {
	it('defaults both flags to false', () => {
		expect(parseArgs([])).toEqual({ dryRun: false, overwrite: false });
	});

	it('detects --dry-run', () => {
		expect(parseArgs(['--dry-run']).dryRun).toBe(true);
	});

	it('detects --overwrite', () => {
		expect(parseArgs(['--overwrite']).overwrite).toBe(true);
	});

	it('detects both flags', () => {
		expect(parseArgs(['--dry-run', '--overwrite'])).toEqual({
			dryRun: true,
			overwrite: true
		});
	});
});

describe('buildPatchFromPii', () => {
	const fullPii: OrderPii = {
		orderRef: 'MG-260410-ABCD',
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: '0123456789',
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen — R 450.00',
		customerNotes: 'Please gift wrap',
		trackingNumber: 'CG-12345',
		trackingUrl: 'https://example.com/track/CG-12345',
		shippingCarrier: 'Courier Guy',
		internalNotes: 'aunt of Meryl, deliver early',
		createdAt: '2026-04-10T12:00:00Z',
		ttl: 1_800_000_000
	};

	const emptySanity = {
		customerName: null,
		customerEmail: null,
		customerPhone: null,
		shippingAddress: null,
		items: null,
		customerNotes: null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		internalNotes: null
	};

	it('restores every PII field when the Sanity doc is empty (post-Phase-1 scrub case)', () => {
		const patch = buildPatchFromPii(fullPii, emptySanity, false);
		expect(patch).not.toBeNull();
		expect(patch).toEqual({
			customerName: 'Jane Smith',
			customerEmail: 'jane@example.com',
			customerPhone: '0123456789',
			shippingAddress: '1 Test Street',
			items: '1 x Small Screen — R 450.00',
			customerNotes: 'Please gift wrap',
			trackingNumber: 'CG-12345',
			trackingUrl: 'https://example.com/track/CG-12345',
			shippingCarrier: 'Courier Guy',
			internalNotes: 'aunt of Meryl, deliver early'
		});
	});

	it('returns null when the Sanity doc is already fully populated (steady-state Phase 0)', () => {
		const sanityFull = {
			customerName: 'Existing',
			customerEmail: 'existing@example.com',
			customerPhone: 'existing',
			shippingAddress: 'existing',
			items: 'existing',
			customerNotes: 'existing',
			trackingNumber: 'existing',
			trackingUrl: 'existing',
			shippingCarrier: 'existing',
			internalNotes: 'existing'
		};
		const patch = buildPatchFromPii(fullPii, sanityFull, false);
		expect(patch).toBeNull();
	});

	it('only patches the fields that are missing on the Sanity side', () => {
		const partial = {
			...emptySanity,
			customerName: 'Existing',
			customerEmail: 'existing@example.com'
		};
		const patch = buildPatchFromPii(fullPii, partial, false);
		expect(patch).not.toBeNull();
		expect(patch).not.toHaveProperty('customerName');
		expect(patch).not.toHaveProperty('customerEmail');
		expect(patch).toHaveProperty('customerPhone', '0123456789');
		expect(patch).toHaveProperty('shippingAddress', '1 Test Street');
	});

	it('treats empty strings on the Sanity side as missing (so post-scrub orders re-fill)', () => {
		const blanked = { ...emptySanity, customerName: '', customerEmail: '' };
		const patch = buildPatchFromPii(fullPii, blanked, false);
		expect(patch).toHaveProperty('customerName', 'Jane Smith');
		expect(patch).toHaveProperty('customerEmail', 'jane@example.com');
	});

	it('--overwrite replaces non-null Sanity values', () => {
		const sanityFull = {
			...emptySanity,
			customerName: 'STALE',
			customerEmail: 'stale@example.com'
		};
		const patch = buildPatchFromPii(fullPii, sanityFull, true);
		expect(patch).toHaveProperty('customerName', 'Jane Smith');
		expect(patch).toHaveProperty('customerEmail', 'jane@example.com');
	});

	it('never overwrites a Sanity value with an empty-string DynamoDB sentinel', () => {
		// Empty strings in DynamoDB indicate retention-scrub from the
		// backfill — they are not real PII and must not be written back
		// to Sanity, even under --overwrite.
		const piiWithBlanks: OrderPii = {
			...fullPii,
			customerName: '',
			customerEmail: '',
			items: ''
		};
		const sanityFull = {
			...emptySanity,
			customerName: 'Real Name',
			customerEmail: 'real@example.com',
			items: 'Real items'
		};
		const patch = buildPatchFromPii(piiWithBlanks, sanityFull, true);
		expect(patch).not.toBeNull();
		expect(patch).not.toHaveProperty('customerName');
		expect(patch).not.toHaveProperty('customerEmail');
		expect(patch).not.toHaveProperty('items');
		// But other real fields still patched under --overwrite:
		expect(patch).toHaveProperty('customerPhone', '0123456789');
	});

	it('skips null PII fields (no patch entry, no accidental null-ing of Sanity)', () => {
		const piiPartial: OrderPii = {
			...fullPii,
			trackingNumber: null,
			trackingUrl: null,
			shippingCarrier: null
		};
		const sanityFull = {
			...emptySanity,
			trackingNumber: 'still-here',
			trackingUrl: 'still-here',
			shippingCarrier: 'still-here'
		};
		const patch = buildPatchFromPii(piiPartial, sanityFull, true);
		expect(patch).not.toBeNull();
		expect(patch).not.toHaveProperty('trackingNumber');
		expect(patch).not.toHaveProperty('trackingUrl');
		expect(patch).not.toHaveProperty('shippingCarrier');
	});
});

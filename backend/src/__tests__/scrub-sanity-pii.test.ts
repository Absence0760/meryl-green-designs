import { describe, it, expect } from 'vitest';
import {
	buildScrubPatch,
	parseArgs,
	shouldRefuse,
	type Args
} from '../scripts/scrub-sanity-pii.js';

describe('parseArgs', () => {
	it('defaults all flags to false', () => {
		expect(parseArgs([])).toEqual({
			dryRun: false,
			prod: false,
			yes: false
		});
	});

	it('detects --dry-run', () => {
		expect(parseArgs(['--dry-run']).dryRun).toBe(true);
	});

	it('detects --prod', () => {
		expect(parseArgs(['--prod']).prod).toBe(true);
	});

	it('detects --yes', () => {
		expect(parseArgs(['--yes']).yes).toBe(true);
	});

	it('detects every flag in one go', () => {
		expect(parseArgs(['--dry-run', '--prod', '--yes'])).toEqual({
			dryRun: true,
			prod: true,
			yes: true
		});
	});
});

describe('shouldRefuse', () => {
	const baseArgs: Args = { dryRun: false, prod: false, yes: false };

	it('always allows dry-run, regardless of other flags', () => {
		expect(shouldRefuse({ ...baseArgs, dryRun: true })).toBeNull();
		expect(shouldRefuse({ ...baseArgs, dryRun: true, prod: true, yes: true })).toBeNull();
	});

	it('refuses any non-dry run without --prod (Sanity writes always hit prod)', () => {
		expect(shouldRefuse(baseArgs)).toMatch(/Pass --prod/);
	});

	it('refuses --prod without --yes (destructive)', () => {
		expect(shouldRefuse({ ...baseArgs, prod: true })).toMatch(/--yes/);
	});

	it('allows --prod --yes together', () => {
		expect(shouldRefuse({ ...baseArgs, prod: true, yes: true })).toBeNull();
	});

	it('refuses --yes alone (the --yes-only ramp is a footgun without --prod)', () => {
		expect(shouldRefuse({ ...baseArgs, yes: true })).toMatch(/Pass --prod/);
	});
});

describe('buildScrubPatch', () => {
	// Helper builder — every PII field present so individual tests can
	// scrub specific fields and verify the rest are still patched.
	function populatedOrder() {
		return {
			customerName: 'Jane Smith',
			customerEmail: 'jane@example.com',
			customerPhone: '0123456789',
			shippingAddress: '1 Test St',
			items: '1 x Small Screen',
			customerNotes: 'Wrap in tissue',
			trackingNumber: 'CG123',
			trackingUrl: 'https://courier.example.com/track/CG123',
			shippingCarrier: 'Courier Guy',
			internalNotes: 'Repeat customer'
		};
	}

	it('returns a patch setting every PII field to null when all are populated', () => {
		const patch = buildScrubPatch(populatedOrder());
		expect(patch).toEqual({
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
		});
	});

	it('skips fields already null (re-run idempotency — never bumps _updatedAt for nothing)', () => {
		const partial = populatedOrder();
		partial.customerName = null as unknown as string;
		partial.shippingAddress = null as unknown as string;
		const patch = buildScrubPatch(partial);
		expect(patch).not.toBeNull();
		expect(patch).not.toHaveProperty('customerName');
		expect(patch).not.toHaveProperty('shippingAddress');
		expect(patch).toHaveProperty('customerEmail', null);
		expect(patch).toHaveProperty('items', null);
	});

	it('returns null when every PII field is already null (fully-scrubbed doc)', () => {
		const allNull = Object.fromEntries(
			Object.keys(populatedOrder()).map((key) => [key, null])
		) as unknown as ReturnType<typeof populatedOrder>;
		expect(buildScrubPatch(allNull)).toBeNull();
	});

	it('treats undefined the same as null (doc projection may omit absent fields)', () => {
		const undef = { ...populatedOrder() };
		(undef as Partial<typeof undef>).trackingUrl = undefined;
		(undef as Partial<typeof undef>).shippingCarrier = undefined;
		const patch = buildScrubPatch(undef);
		expect(patch).not.toBeNull();
		expect(patch).not.toHaveProperty('trackingUrl');
		expect(patch).not.toHaveProperty('shippingCarrier');
	});

	it('preserves empty-string values as-needing-scrub (operator manually cleared the field)', () => {
		// A trailing empty-string sentinel from a Phase-0 dual-write of a
		// scrubbed-then-restored order is still PII-shaped data we should
		// null out. Sanity treats '' and null distinctly in queries; we
		// normalise both to null on the scrub.
		const empties = populatedOrder();
		empties.customerNotes = '';
		const patch = buildScrubPatch(empties);
		expect(patch).toHaveProperty('customerNotes', null);
	});
});

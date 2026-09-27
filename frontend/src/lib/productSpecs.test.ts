import { describe, it, expect } from 'vitest';
import { CUSHION_MATERIALS, LEAD_TIME, SCREEN_MATERIALS } from './productSpecs';

const labels = (specs: readonly { label: string }[]) => specs.map((s) => s.label);

describe('product specs', () => {
	it('states the 3-week made-to-order lead time, like the Terms', () => {
		expect(LEAD_TIME.toLowerCase()).toContain('made to order');
		expect(LEAD_TIME).toContain('3 weeks');
	});

	it('lists frame and fabric for screens, covering both canvas and basket weave', () => {
		expect(labels(SCREEN_MATERIALS)).toEqual(['Frame', 'Fabric']);
		const fabric = SCREEN_MATERIALS.find((s) => s.label === 'Fabric')!.value.toLowerCase();
		expect(fabric).toContain('canvas');
		expect(fabric).toContain('basket weave');
	});

	it('says cushion covers are cotton and come without an insert', () => {
		expect(labels(CUSHION_MATERIALS)).toEqual(['Fabric', 'Insert']);
		expect(CUSHION_MATERIALS[0].value.toLowerCase()).toContain('cotton');
		expect(CUSHION_MATERIALS[1].value.toLowerCase()).toContain('not included');
	});

	it('never mentions a frame for cushion covers', () => {
		expect(labels(CUSHION_MATERIALS)).not.toContain('Frame');
	});
});

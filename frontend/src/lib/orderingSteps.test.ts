import { describe, it, expect } from 'vitest';
import { ORDERING_STEPS } from './orderingSteps';

const text = (s: (typeof ORDERING_STEPS)[number]) =>
	`${s.title} ${s.body} ${s.link?.label ?? ''}`.toLowerCase();

describe('ORDERING_STEPS', () => {
	it('has four steps, each with a title and body', () => {
		expect(ORDERING_STEPS).toHaveLength(4);
		for (const step of ORDERING_STEPS) {
			expect(step.title.trim()).not.toBe('');
			expect(step.body.trim()).not.toBe('');
		}
	});

	it('says both product types are made to order', () => {
		const all = ORDERING_STEPS.map(text).join(' ');
		expect(all).toContain('made to order');
		expect(all).toContain('folding screen');
		expect(all).toContain('cushion cover');
	});

	// Legal guard: the cooling-off exemption is scoped in the Terms and
	// Returns pages (screens only, pending counsel) — never restated here.
	it('never mentions cancellation or cooling-off rights', () => {
		const all = ORDERING_STEPS.map(text).join(' ');
		expect(all).not.toMatch(/cooling|cancel|refund|section 44/);
	});

	it('states the 3-week lead time and South Africa-only delivery, like the Terms', () => {
		const all = ORDERING_STEPS.map(text).join(' ');
		expect(all).toContain('3 weeks');
		expect(all).toContain('south africa');
	});

	it('names PayFast and no card processor other than it', () => {
		const all = ORDERING_STEPS.map(text).join(' ');
		expect(all).toContain('payfast');
		expect(all).not.toMatch(/stripe|paystack|yoco|peach/);
	});

	it('links only to site-relative paths', () => {
		for (const step of ORDERING_STEPS) {
			if (step.link) expect(step.link.href).toMatch(/^\/[a-z]/);
		}
	});
});

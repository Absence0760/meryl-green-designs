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

	// Legal guard: the Terms claim "made to order" (and the cooling-off
	// exemption that rests on it) for folding screens only.
	it('claims "made to order" only for folding screens', () => {
		for (const step of ORDERING_STEPS) {
			const t = text(step);
			if (t.includes('made to order')) {
				expect(t).toContain('folding screens');
				expect(t).not.toContain('cushion');
			}
		}
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

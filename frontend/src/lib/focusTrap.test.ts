import { describe, expect, it } from 'vitest';
import { nextTrapIndex } from './focusTrap';

describe('nextTrapIndex', () => {
	it('wraps Tab from the last element to the first', () => {
		expect(nextTrapIndex(2, 3, false)).toBe(0);
	});

	it('wraps Shift+Tab from the first element to the last', () => {
		expect(nextTrapIndex(0, 3, true)).toBe(2);
	});

	it('leaves Tab between inner elements to the browser', () => {
		expect(nextTrapIndex(0, 3, false)).toBeNull();
		expect(nextTrapIndex(1, 3, false)).toBeNull();
		expect(nextTrapIndex(2, 3, true)).toBeNull();
	});

	it('pulls focus from outside the list to the matching edge', () => {
		expect(nextTrapIndex(-1, 3, false)).toBe(0);
		expect(nextTrapIndex(-1, 3, true)).toBe(2);
	});

	it('does nothing when there is nothing focusable', () => {
		expect(nextTrapIndex(-1, 0, false)).toBeNull();
	});

	it('keeps a single focusable element focused in both directions', () => {
		expect(nextTrapIndex(0, 1, false)).toBe(0);
		expect(nextTrapIndex(0, 1, true)).toBe(0);
	});
});

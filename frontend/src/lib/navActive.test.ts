import { describe, expect, it } from 'vitest';
import { isNavActive } from './navActive';

describe('isNavActive', () => {
	it('matches home only on the root path', () => {
		expect(isNavActive('/', '/')).toBe(true);
		expect(isNavActive('/', '/shop')).toBe(false);
	});

	it('matches a section and its child pages', () => {
		expect(isNavActive('/shop', '/shop')).toBe(true);
		expect(isNavActive('/shop', '/shop/acacia-screen')).toBe(true);
	});

	it('does not match a sibling path that merely shares a prefix', () => {
		expect(isNavActive('/shop', '/shopping')).toBe(false);
		expect(isNavActive('/gallery', '/shop')).toBe(false);
	});
});

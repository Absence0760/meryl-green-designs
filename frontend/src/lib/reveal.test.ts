import { afterEach, describe, expect, it, vi } from 'vitest';
import { reveal } from './reveal';

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

function fakeNode() {
	const classes = new Set<string>();
	return {
		classList: {
			add: (c: string) => classes.add(c),
			has: (c: string) => classes.has(c)
		},
		style: {} as Record<string, string>,
		classes
	};
}

function installObserver() {
	const instances: Array<{ cb: Callback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
	class FakeObserver {
		observe = vi.fn();
		disconnect = vi.fn();
		constructor(public cb: Callback) {
			instances.push(this);
		}
	}
	vi.stubGlobal('IntersectionObserver', FakeObserver);
	return instances;
}

afterEach(() => vi.unstubAllGlobals());

describe('reveal', () => {
	it('does nothing when IntersectionObserver is unavailable, so content stays visible', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const node = fakeNode();
		reveal(node as unknown as HTMLElement);
		expect(node.classes.size).toBe(0);
	});

	it('hides the element at mount and reveals it once it intersects', () => {
		const observers = installObserver();
		const node = fakeNode();
		reveal(node as unknown as HTMLElement);
		expect(node.classes.has('reveal')).toBe(true);
		expect(node.classes.has('is-visible')).toBe(false);

		observers[0].cb([{ isIntersecting: false }]);
		expect(node.classes.has('is-visible')).toBe(false);

		observers[0].cb([{ isIntersecting: true }]);
		expect(node.classes.has('is-visible')).toBe(true);
		expect(observers[0].disconnect).toHaveBeenCalled();
	});

	it('applies a stagger delay and disconnects on destroy', () => {
		const observers = installObserver();
		const node = fakeNode();
		const action = reveal(node as unknown as HTMLElement, { delay: 120 });
		expect(node.style.transitionDelay).toBe('120ms');
		action.destroy?.();
		expect(observers[0].disconnect).toHaveBeenCalled();
	});
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ADDED_FLASH_MS, createAddedFlash } from './addedFlash';

describe('createAddedFlash', () => {
	let active: Set<string>;
	const onChange = (ids: Set<string>) => {
		active = ids;
	};

	beforeEach(() => {
		vi.useFakeTimers();
		active = new Set();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('marks an id as added, then clears it after the duration', () => {
		const flash = createAddedFlash(onChange);
		flash.mark('p1');
		expect([...active]).toEqual(['p1']);
		vi.advanceTimersByTime(ADDED_FLASH_MS - 1);
		expect(active.has('p1')).toBe(true);
		vi.advanceTimersByTime(1);
		expect(active.size).toBe(0);
	});

	it('restarts the timer on a repeat click', () => {
		const flash = createAddedFlash(onChange, 1000);
		flash.mark('p1');
		vi.advanceTimersByTime(800);
		flash.mark('p1');
		vi.advanceTimersByTime(800);
		expect(active.has('p1')).toBe(true);
		vi.advanceTimersByTime(200);
		expect(active.has('p1')).toBe(false);
	});

	it('tracks several products independently', () => {
		const flash = createAddedFlash(onChange, 1000);
		flash.mark('p1');
		vi.advanceTimersByTime(500);
		flash.mark('p2');
		expect([...active].sort()).toEqual(['p1', 'p2']);
		vi.advanceTimersByTime(500);
		expect([...active]).toEqual(['p2']);
		vi.advanceTimersByTime(500);
		expect(active.size).toBe(0);
	});

	it('emits a new Set each time, so a component assignment re-renders', () => {
		const seen: Set<string>[] = [];
		const flash = createAddedFlash((ids) => seen.push(ids), 1000);
		flash.mark('p1');
		vi.advanceTimersByTime(1000);
		expect(seen).toHaveLength(2);
		expect(seen[0]).not.toBe(seen[1]);
	});

	it('destroy() cancels pending timers without emitting', () => {
		const onChangeSpy = vi.fn();
		const flash = createAddedFlash(onChangeSpy, 1000);
		flash.mark('p1');
		onChangeSpy.mockClear();
		flash.destroy();
		vi.advanceTimersByTime(2000);
		expect(onChangeSpy).not.toHaveBeenCalled();
	});
});

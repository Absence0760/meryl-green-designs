// Short-lived "✓ Added" state for the "Add to order" buttons (shop grid
// and product page), so a sighted visitor gets confirmation where they
// clicked — the header badge alone is easy to miss, especially on a
// phone. Plain .ts (not a rune module) so vitest can import it.

/** How long a button reads "Added" before switching back. */
export const ADDED_FLASH_MS = 2000;

export type AddedFlash = {
	/** Show "Added" for `id`; a repeat click restarts its timer. */
	mark(id: string): void;
	/** Clear every pending timer (call from onDestroy). */
	destroy(): void;
};

/**
 * Tracks which product ids were added in the last `durationMs`.
 * `onChange` receives a fresh Set each time the active ids change, so a
 * legacy `let` assignment in the component re-renders it.
 */
export function createAddedFlash(
	onChange: (ids: Set<string>) => void,
	durationMs: number = ADDED_FLASH_MS
): AddedFlash {
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const emit = () => onChange(new Set(timers.keys()));

	return {
		mark(id) {
			clearTimeout(timers.get(id));
			timers.set(
				id,
				setTimeout(() => {
					timers.delete(id);
					emit();
				}, durationMs)
			);
			emit();
		},
		destroy() {
			for (const t of timers.values()) clearTimeout(t);
			timers.clear();
		}
	};
}

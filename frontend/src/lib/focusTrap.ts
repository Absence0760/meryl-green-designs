// Focus management for modal surfaces (cart panel, gallery lightbox).
// `use:focusTrap` on the dialog element:
//   - moves focus into it on mount (the `[data-autofocus]` element if
//     there is one, otherwise the first focusable element),
//   - keeps Tab / Shift+Tab cycling inside it while it is open,
//   - hands focus back to whatever had it before (the trigger button)
//     when it unmounts.
// Plain .ts (not .svelte.ts) so the pure pieces are unit-testable.

export const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Where Tab should land next, or null to let the browser handle it.
 * Only the two edges need intervention: Tab on the last element wraps to
 * the first, Shift+Tab on the first wraps to the last. Focus that is not
 * on any of the elements (e.g. on the dialog container itself) is pulled
 * to the appropriate edge.
 */
export function nextTrapIndex(current: number, count: number, backwards: boolean): number | null {
	if (count === 0) return null;
	if (current === -1) return backwards ? count - 1 : 0;
	if (backwards && current === 0) return count - 1;
	if (!backwards && current === count - 1) return 0;
	return null;
}

export function focusTrap(node: HTMLElement) {
	const previouslyFocused =
		typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

	const focusables = () =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
			(el) => el.getClientRects().length > 0
		);

	const initial = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? node;
	// preventScroll: the panels are fixed-position; don't jump the page.
	initial.focus({ preventScroll: true });

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const els = focusables();
		const target = nextTrapIndex(
			els.indexOf(document.activeElement as HTMLElement),
			els.length,
			e.shiftKey
		);
		if (target === null) return;
		e.preventDefault();
		els[target].focus();
	}

	node.addEventListener('keydown', onKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			if (previouslyFocused && previouslyFocused.isConnected) {
				previouslyFocused.focus({ preventScroll: true });
			}
		}
	};
}

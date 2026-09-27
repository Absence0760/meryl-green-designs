// Scroll-reveal action: fades an element up the first time it enters the
// viewport. Progressive enhancement only — the `reveal` class (which
// starts the element hidden) is added by this action at mount, so with JS
// off, or without IntersectionObserver, content is simply visible. Users
// with prefers-reduced-motion get no transform (see app.css).

export type RevealOptions = {
	/** Delay in ms before the transition starts, for staggering siblings. */
	delay?: number;
	/** Fraction of the element that must be visible before it reveals. */
	threshold?: number;
};

export function reveal(node: HTMLElement, options: RevealOptions = {}) {
	if (typeof IntersectionObserver === 'undefined') return {};

	node.classList.add('reveal');
	if (options.delay) node.style.transitionDelay = `${options.delay}ms`;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.add('is-visible');
					observer.disconnect();
				}
			}
		},
		// Trigger slightly before the element is fully on screen so the
		// motion finishes as it arrives rather than after.
		{ threshold: options.threshold ?? 0.12, rootMargin: '0px 0px -40px 0px' }
	);
	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}

// Whether a primary-nav link points at the current page (or a section
// the current page lives under, e.g. /shop for /shop/<slug>). Drives
// both the `.active` style and `aria-current="page"` in +layout.svelte.
export function isNavActive(href: string, pathname: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}

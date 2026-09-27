// Pure pieces of /sitemap.xml (src/routes/sitemap.xml/+server.ts), kept
// out of the route so vitest can cover them.
//
// The route is prerendered, so this runs once at build time. Product
// URLs come from the backend's GET /products; if that call fails the
// sitemap falls back to the static pages — the build must never fail
// because the API is down.

// Top-level indexable routes. /track and /payment/* are noindex
// (per-order or post-checkout only) and disallowed in robots.txt.
export const STATIC_ROUTES = [
	'/',
	'/shop',
	'/gallery',
	'/contact',
	'/privacy',
	'/returns',
	'/terms'
] as const;

export const PRODUCT_FETCH_TIMEOUT_MS = 5000;

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function buildSitemapXml(siteUrl: string, paths: readonly string[]): string {
	const base = siteUrl.replace(/\/$/, '');
	const urls = paths.map((path) => `\t<url><loc>${escapeXml(`${base}${path}`)}</loc></url>`);
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

type ProductLike = { slug?: unknown; available?: unknown };

/** `/shop/<slug>` for each available product, deduped, in input order. */
export function productPaths(products: readonly ProductLike[]): string[] {
	const seen = new Set<string>();
	const paths: string[] = [];
	for (const product of products) {
		if (product.available === false) continue;
		if (typeof product.slug !== 'string' || product.slug.trim() === '') continue;
		const path = `/shop/${encodeURIComponent(product.slug)}`;
		if (seen.has(path)) continue;
		seen.add(path);
		paths.push(path);
	}
	return paths;
}

export type FetchProductPathsOptions = {
	fetch?: typeof fetch;
	timeoutMs?: number;
	warn?: (message: string) => void;
};

/**
 * Product paths from `${apiUrl}/products`, or `[]` (with a warning) on
 * any failure: no API URL, network error, timeout, non-2xx, bad JSON.
 * Never throws.
 */
export async function fetchProductPaths(
	apiUrl: string | undefined,
	{
		fetch: fetchImpl = fetch,
		timeoutMs = PRODUCT_FETCH_TIMEOUT_MS,
		warn = (message) => console.warn(message)
	}: FetchProductPathsOptions = {}
): Promise<string[]> {
	const prefix = '[sitemap] product URLs omitted:';
	if (!apiUrl) {
		warn(`${prefix} PUBLIC_API_URL is not set.`);
		return [];
	}
	const endpoint = `${apiUrl.replace(/\/$/, '')}/products`;
	try {
		const res = await fetchImpl(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) {
			warn(`${prefix} GET ${endpoint} returned ${res.status}.`);
			return [];
		}
		const body = (await res.json()) as { products?: unknown };
		if (!Array.isArray(body?.products)) {
			warn(`${prefix} GET ${endpoint} returned no products array.`);
			return [];
		}
		return productPaths(body.products as ProductLike[]);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		warn(`${prefix} GET ${endpoint} failed (${reason}).`);
		return [];
	}
}

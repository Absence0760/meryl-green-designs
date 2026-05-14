import { PUBLIC_SITE_URL } from '$env/static/public';

export const prerender = true;

// Top-level routes that should be in the sitemap. /shop/[slug] is deliberately
// omitted: product slugs come from Sanity and would need a build-time fetch to
// enumerate. Crawlers discover them by following links from /shop.
// /track and /payment/* are noindex (per-order or post-checkout only).
const ROUTES = ['/', '/shop', '/gallery', '/contact', '/privacy', '/returns', '/terms'];

export function GET() {
	const base = (PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
	const urls = ROUTES.map((path) => `\t<url><loc>${base}${path}</loc></url>`).join('\n');
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
	return new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
}

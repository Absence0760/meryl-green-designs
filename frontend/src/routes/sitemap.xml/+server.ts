import { PUBLIC_API_URL, PUBLIC_SITE_URL } from '$env/static/public';
import { STATIC_ROUTES, buildSitemapXml, fetchProductPaths } from '$lib/sitemap';

// Prerendered at build time. Product URLs are fetched from the backend
// then; a failed fetch logs a warning and emits the static pages only
// (see src/lib/sitemap.ts). New products therefore appear after the next
// frontend build — the Sanity publish webhook triggers one
// (docs/deployment.md § Step 7).
export const prerender = true;

export async function GET() {
	const products = await fetchProductPaths(PUBLIC_API_URL);
	const body = buildSitemapXml(PUBLIC_SITE_URL ?? '', [...STATIC_ROUTES, ...products]);
	return new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
}

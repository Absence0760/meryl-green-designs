import { describe, expect, it, vi } from 'vitest';
import { STATIC_ROUTES, buildSitemapXml, fetchProductPaths, productPaths } from './sitemap';

const SITE = 'https://merylgreendesigns.com';

describe('buildSitemapXml', () => {
	it('emits one <url> per path under the site URL', () => {
		const xml = buildSitemapXml(`${SITE}/`, ['/', '/shop', '/shop/two-trees']);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')).toBe(true);
		expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect(xml.match(/<url>/g)).toHaveLength(3);
		expect(xml).toContain(`<loc>${SITE}/</loc>`);
		expect(xml).toContain(`<loc>${SITE}/shop/two-trees</loc>`);
		expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
	});

	it('XML-escapes locations', () => {
		const xml = buildSitemapXml(SITE, ["/a?x=1&y=<2>'\""]);
		expect(xml).toContain('<loc>https://merylgreendesigns.com/a?x=1&amp;y=&lt;2&gt;&apos;&quot;</loc>');
	});

	it('produces an empty urlset for no paths', () => {
		expect(buildSitemapXml(SITE, [])).not.toContain('<url>');
	});

	it('keeps the noindex routes out of the static list', () => {
		expect(STATIC_ROUTES).toContain('/shop');
		expect(STATIC_ROUTES.some((p) => p.startsWith('/track') || p.startsWith('/payment'))).toBe(
			false
		);
	});
});

describe('productPaths', () => {
	it('maps available products to encoded /shop paths, deduped, skipping junk', () => {
		expect(
			productPaths([
				{ slug: 'two-trees', available: true },
				{ slug: 'sold', available: false },
				{ slug: 'two-trees', available: true },
				{ slug: 'a b' },
				{ slug: '' },
				{ slug: 42 },
				{}
			])
		).toEqual(['/shop/two-trees', '/shop/a%20b']);
	});
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('fetchProductPaths', () => {
	it('fetches /products and returns product paths', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ products: [{ slug: 'x', available: true }] }));
		const warn = vi.fn();
		const paths = await fetchProductPaths('https://api.example.com/', {
			fetch: fetchImpl as unknown as typeof fetch,
			warn
		});
		expect(paths).toEqual(['/shop/x']);
		expect(fetchImpl).toHaveBeenCalledWith(
			'https://api.example.com/products',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		['a network error', async () => Promise.reject(new TypeError('fetch failed'))],
		['a 500', async () => jsonResponse({ products: [], error: 'x' }, 500)],
		['malformed JSON', async () => new Response('not json', { status: 200 })],
		['a body without a products array', async () => jsonResponse({ nope: true })]
	])('returns [] and warns on %s', async (_label, impl) => {
		const warn = vi.fn();
		const paths = await fetchProductPaths('https://api.example.com', {
			fetch: vi.fn(impl) as unknown as typeof fetch,
			warn
		});
		expect(paths).toEqual([]);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toMatch(/^\[sitemap\] product URLs omitted:/);
	});

	it('gives up after the timeout', async () => {
		const hang = (_url: string, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
			});
		const warn = vi.fn();
		const paths = await fetchProductPaths('https://api.example.com', {
			fetch: hang as unknown as typeof fetch,
			timeoutMs: 20,
			warn
		});
		expect(paths).toEqual([]);
		expect(warn).toHaveBeenCalledOnce();
	});

	it('skips the fetch when no API URL is configured', async () => {
		const fetchImpl = vi.fn();
		const warn = vi.fn();
		expect(
			await fetchProductPaths('', { fetch: fetchImpl as unknown as typeof fetch, warn })
		).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledOnce();
	});
});

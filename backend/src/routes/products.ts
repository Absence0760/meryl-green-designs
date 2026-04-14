import { Hono } from 'hono';
import { getProducts, getProductBySlug } from '../sanity.js';

export const products = new Hono();

products.get('/', async (c) => {
	try {
		const list = await getProducts();
		return c.json({ products: list });
	} catch (err) {
		console.error('Failed to fetch products from Sanity', err);
		return c.json({ products: [], error: 'Failed to load products' }, 500);
	}
});

products.get('/:slug', async (c) => {
	const slug = c.req.param('slug');
	if (!slug) {
		return c.json({ error: 'Slug is required' }, 400);
	}
	try {
		const product = await getProductBySlug(slug);
		if (!product) {
			return c.json({ error: 'Product not found' }, 404);
		}
		return c.json({ product });
	} catch (err) {
		console.error('Failed to fetch product by slug', err);
		return c.json({ error: 'Failed to load product' }, 500);
	}
});

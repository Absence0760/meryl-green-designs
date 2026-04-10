import { Hono } from 'hono';
import { getProducts } from '../sanity.js';

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

import { loadProducts } from '$lib/queries';

export const prerender = true;

export async function load() {
	const products = await loadProducts();
	return { products };
}

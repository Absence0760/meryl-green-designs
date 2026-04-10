import { PUBLIC_API_URL } from '$env/static/public';
import type { Product } from '$lib/sanity';

export const prerender = true;

export async function load({ fetch }) {
	if (!PUBLIC_API_URL) {
		return { products: [] as Product[] };
	}

	try {
		const res = await fetch(`${PUBLIC_API_URL}/products`);
		if (!res.ok) {
			console.warn(`Failed to fetch products from backend: ${res.status}`);
			return { products: [] as Product[] };
		}
		const data = (await res.json()) as { products?: Product[] };
		return { products: data.products ?? [] };
	} catch (err) {
		console.warn('Failed to fetch products from backend — returning empty list.', err);
		return { products: [] as Product[] };
	}
}

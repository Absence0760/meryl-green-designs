import { sanityClient, type Product } from './sanity';

const PRODUCTS_QUERY = `*[_type == "product" && available == true] | order(order asc, name asc) {
	_id,
	name,
	"slug": slug.current,
	blurb,
	description,
	priceZar,
	available,
	order,
	photos[] {
		_key,
		alt,
		asset
	}
}`;

export async function loadProducts(): Promise<Product[]> {
	const client = sanityClient();
	if (!client) {
		return [];
	}

	try {
		return await client.fetch<Product[]>(PRODUCTS_QUERY);
	} catch (err) {
		console.warn('Failed to fetch products from Sanity — returning empty list.', err);
		return [];
	}
}

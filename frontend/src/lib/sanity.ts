import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';
import { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } from '$env/static/public';

export type Product = {
	_id: string;
	name: string;
	slug: string;
	blurb: string | null;
	description: string | null;
	priceZar: number | null;
	available: boolean;
	order: number;
	photos: Array<{
		_key: string;
		alt: string | null;
		asset: { _ref: string };
	}>;
};

let cachedClient: SanityClient | null = null;

export function sanityClient(): SanityClient | null {
	if (!PUBLIC_SANITY_PROJECT_ID) return null;
	if (cachedClient) return cachedClient;

	cachedClient = createClient({
		projectId: PUBLIC_SANITY_PROJECT_ID,
		dataset: PUBLIC_SANITY_DATASET || 'production',
		apiVersion: '2024-10-01',
		useCdn: true,
		perspective: 'published'
	});
	return cachedClient;
}

export function imageUrl(source: SanityImageSource): string | null {
	const client = sanityClient();
	if (!client) return null;
	return imageUrlBuilder(client).image(source).auto('format').fit('max').url();
}

export function formatPrice(priceZar: number | null): string {
	if (priceZar == null) return 'Price on enquiry';
	return `R ${priceZar.toLocaleString('en-ZA')}`;
}

import { PUBLIC_API_URL } from '$env/static/public';
import type { GalleryPhoto } from '$lib/sanity';

export const prerender = true;

export async function load({ fetch }) {
	if (!PUBLIC_API_URL) {
		return { photos: [] as GalleryPhoto[] };
	}

	try {
		const res = await fetch(`${PUBLIC_API_URL}/gallery`);
		if (!res.ok) {
			console.warn(`Failed to fetch gallery photos from backend: ${res.status}`);
			return { photos: [] as GalleryPhoto[] };
		}
		const data = (await res.json()) as { photos?: GalleryPhoto[] };
		return { photos: data.photos ?? [] };
	} catch (err) {
		console.warn('Failed to fetch gallery photos from backend — returning empty list.', err);
		return { photos: [] as GalleryPhoto[] };
	}
}

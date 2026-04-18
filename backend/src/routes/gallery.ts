import { Hono } from 'hono';
import { getGalleryPhotos } from '../sanity.js';

export const gallery = new Hono();

gallery.get('/', async (c) => {
	try {
		const photos = await getGalleryPhotos();
		return c.json({ photos });
	} catch (err) {
		console.error('Failed to fetch gallery photos from Sanity', err);
		return c.json({ photos: [], error: 'Failed to load gallery photos' }, 500);
	}
});

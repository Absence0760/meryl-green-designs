import { Hono } from 'hono';
import { readLocalImage } from '../content-local.js';

export function devContentRouter() {
	const router = new Hono();

	router.get('/images/:name', async (c) => {
		const image = await readLocalImage(c.req.param('name'));
		if (!image) {
			return c.json({ error: 'Image not found' }, 404);
		}
		return c.body(new Uint8Array(image.body), 200, {
			'Content-Type': image.contentType,
			'Cache-Control': 'no-store'
		});
	});

	return router;
}

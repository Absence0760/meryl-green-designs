import { Hono } from 'hono';
import { getTestimonials } from '../sanity.js';

export const testimonials = new Hono();

testimonials.get('/', async (c) => {
	try {
		const list = await getTestimonials();
		return c.json({ testimonials: list });
	} catch (err) {
		console.error('Failed to fetch testimonials from Sanity', err);
		return c.json({ testimonials: [], error: 'Failed to load testimonials' }, 500);
	}
});

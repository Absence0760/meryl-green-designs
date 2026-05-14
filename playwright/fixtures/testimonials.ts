export type SeedTestimonial = {
	_id: string;
	quote: string;
	author: string;
	location?: string;
	visible: boolean;
	order: number;
};

export const seedTestimonials: SeedTestimonial[] = [
	{
		_id: 'e2e-testimonial-1',
		quote: 'A beautiful piece — the e2e suite asserts this text renders on the home page.',
		author: 'E2E Test Customer',
		location: 'Cape Town',
		visible: true,
		order: 10,
	},
];

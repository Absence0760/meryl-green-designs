import { defineField, defineType } from 'sanity';

export const testimonial = defineType({
	name: 'testimonial',
	title: 'Testimonial',
	type: 'document',
	fields: [
		defineField({
			name: 'quote',
			title: 'Quote',
			description:
				'What the customer said, in their own words. Keep it concise — one to three sentences works best.',
			type: 'text',
			rows: 4,
			validation: (rule) => rule.required().max(600)
		}),
		defineField({
			name: 'author',
			title: 'Author',
			description:
				'The name of the person who gave the testimonial. First name + last initial is fine (e.g. "Jane M.") if the customer prefers not to be fully named.',
			type: 'string',
			validation: (rule) => rule.required().max(80)
		}),
		defineField({
			name: 'location',
			title: 'Location',
			description:
				'Optional — where the customer is based (e.g. "Cape Town", "Johannesburg"). Adds credibility and local colour.',
			type: 'string',
			validation: (rule) => rule.max(80)
		}),
		defineField({
			name: 'visible',
			title: 'Visible on site',
			description:
				'Uncheck to hide this testimonial without deleting it — useful while drafting or if a customer later asks to be removed.',
			type: 'boolean',
			initialValue: true
		}),
		defineField({
			name: 'order',
			title: 'Display order',
			description: 'Lower numbers appear first. Use 0, 10, 20 to leave gaps for inserts.',
			type: 'number',
			initialValue: 0
		})
	],
	orderings: [
		{
			title: 'Display order',
			name: 'displayOrder',
			by: [{ field: 'order', direction: 'asc' }]
		}
	],
	preview: {
		select: {
			title: 'author',
			subtitle: 'quote'
		}
	}
});

import { defineField, defineType } from 'sanity';

export const product = defineType({
	name: 'product',
	title: 'Product',
	type: 'document',
	fields: [
		defineField({
			name: 'name',
			title: 'Name',
			type: 'string',
			validation: (rule) => rule.required().max(120)
		}),
		defineField({
			name: 'slug',
			title: 'Slug',
			description: 'URL-safe identifier, generated from the name.',
			type: 'slug',
			options: { source: 'name', maxLength: 96 },
			validation: (rule) => rule.required()
		}),
		defineField({
			name: 'blurb',
			title: 'Blurb',
			description: 'A short one-line tagline shown on the product card.',
			type: 'string',
			validation: (rule) => rule.max(200)
		}),
		defineField({
			name: 'description',
			title: 'Description',
			description: 'Longer description shown on the product detail view.',
			type: 'text',
			rows: 4
		}),
		defineField({
			name: 'priceZar',
			title: 'Price (ZAR)',
			description: 'Price in South African Rand. Enter whole rand (e.g. 450).',
			type: 'number',
			validation: (rule) => rule.min(0)
		}),
		defineField({
			name: 'photos',
			title: 'Photos',
			description: 'Product photographs. The first photo is used as the main card image.',
			type: 'array',
			of: [
				{
					type: 'image',
					options: { hotspot: true },
					fields: [
						{
							name: 'alt',
							title: 'Alt text',
							type: 'string',
							description: 'Describe the image for accessibility.'
						}
					]
				}
			]
		}),
		defineField({
			name: 'available',
			title: 'Available',
			description: 'Uncheck to hide the product from the shop without deleting it.',
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
			title: 'name',
			subtitle: 'priceZar',
			media: 'photos.0'
		},
		prepare({ title, subtitle, media }) {
			return {
				title,
				subtitle: subtitle ? `R ${subtitle}` : 'No price set',
				media
			};
		}
	}
});

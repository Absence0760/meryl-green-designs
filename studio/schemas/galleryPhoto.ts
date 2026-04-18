import { defineField, defineType } from 'sanity';

export const galleryPhoto = defineType({
	name: 'galleryPhoto',
	title: 'Gallery photo',
	type: 'document',
	fields: [
		defineField({
			name: 'image',
			title: 'Image',
			type: 'image',
			options: { hotspot: true },
			validation: (rule) => rule.required(),
			fields: [
				{
					name: 'alt',
					title: 'Alt text',
					type: 'string',
					description: 'Describe the image for accessibility.'
				}
			]
		}),
		defineField({
			name: 'caption',
			title: 'Caption',
			type: 'string',
			description: 'Optional short caption shown under the image on the gallery page.'
		}),
		defineField({
			name: 'visible',
			title: 'Visible',
			description: 'Uncheck to hide the photo from the gallery without deleting it.',
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
		},
		{
			title: 'Newest first',
			name: 'createdDesc',
			by: [{ field: '_createdAt', direction: 'desc' }]
		}
	],
	preview: {
		select: {
			caption: 'caption',
			media: 'image'
		},
		prepare({ caption, media }) {
			return {
				title: caption || 'Gallery photo',
				media
			};
		}
	}
});

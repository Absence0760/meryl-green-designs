import { defineField, defineType } from 'sanity';

export type ProductCategory = 'screen' | 'cushion-cover';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
	screen: 'Folding screen',
	'cushion-cover': 'Cushion cover'
};

// Products saved before the category field existed have no stored value;
// the backend coalesces that to "screen", so the Studio does the same.
export function productCategory(value: unknown): ProductCategory {
	return value === 'cushion-cover' ? 'cushion-cover' : 'screen';
}

// Soft sanity check on the free-form dimensions text. Returns a warning
// message when the text looks like it belongs to the other category, or
// undefined when it looks fine (or can't be judged). Heuristic only — it
// is surfaced as a warning, never an error, so Meryl can always publish.
export function dimensionsMismatch(
	dimensions: string | undefined,
	category: ProductCategory
): string | undefined {
	const text = dimensions?.trim().toLowerCase();
	if (!text) return undefined;
	const mentionsPanels = /panel/.test(text);
	const cmValues = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:cm|x|×|$)/g)].map((m) =>
		Number(m[1].replace(',', '.'))
	);
	const usesMetres = /\d\s*m\b/.test(text);
	if (category === 'cushion-cover') {
		if (mentionsPanels || usesMetres || cmValues.some((n) => n > 100)) {
			return 'This looks like a folding screen size (panels / large measurements). Cushion covers are usually written like "60cm x 60cm" — double-check the category.';
		}
		return undefined;
	}
	if (!mentionsPanels && !usesMetres && cmValues.length > 0 && cmValues.every((n) => n <= 80)) {
		return 'This looks like a cushion cover size. Folding screens are usually written per panel, like "185cm x 55cm (per panel)" — double-check the category.';
	}
	return undefined;
}

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
			name: 'category',
			title: 'Category',
			description:
				'Decides where the product shows on the website. "Folding screen" puts it under Folding screens in the shop and its page shows the Frame and Canvas details plus "Made to order — typically 3 weeks". "Cushion cover" puts it under Cushion covers, without the frame/canvas lines, and its page shows "Typically 3 weeks from payment to dispatch".',
			type: 'string',
			options: {
				list: [
					{ title: 'Folding screen', value: 'screen' },
					{ title: 'Cushion cover', value: 'cushion-cover' }
				],
				layout: 'radio'
			},
			initialValue: 'screen',
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
			description:
				'Price in South African Rand. Enter whole rand, numbers only (e.g. 450 — no "R").',
			type: 'number',
			validation: (rule) => [
				rule.min(0),
				rule
					.required()
					.warning('No price set — customers can’t buy this product until it has one.')
			]
		}),
		defineField({
			name: 'dimensions',
			title: 'Dimensions',
			description:
				'Size shown on the shop card and product page, typed exactly as you want it to read. Folding screen: "185cm x 55cm (per panel)". Cushion cover: "60cm x 60cm". Leave blank to hide it.',
			type: 'string',
			validation: (rule) => [
				rule.max(120),
				rule
					.custom((value: string | undefined, context) => {
						const category = productCategory(
							(context.document as { category?: unknown } | undefined)?.category
						);
						return dimensionsMismatch(value, category) ?? true;
					})
					.warning()
			]
		}),
		defineField({
			name: 'photos',
			title: 'Photos',
			description:
				'The FIRST photo is the one shown on the shop card — drag to reorder. Tip: put a photo of the full piece first, then a lifestyle shot (in a room, on a couch). Upload the original photos from your phone or camera, not copies sent over WhatsApp — those are compressed and look blurry on the site.',
			type: 'array',
			validation: (rule) =>
				rule.min(1).warning('No photos yet — the shop card will have no image.'),
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
			description:
				'Uncheck to hide the product from the shop without deleting it (e.g. sold out). Hidden products show "Hidden" in the product list.',
			type: 'boolean',
			initialValue: true
		}),
		defineField({
			name: 'order',
			title: 'Display order',
			description:
				'Where the product sits within its shop section — lower numbers appear first (screens and cushion covers are ordered separately). Use 10, 20, 30… so you can slot a new product in between later (e.g. 15) without renumbering.',
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
			price: 'priceZar',
			category: 'category',
			available: 'available',
			media: 'photos.0'
		},
		prepare({ title, price, category, available, media }) {
			const parts = [
				CATEGORY_LABELS[productCategory(category)],
				price ? `R ${price}` : 'No price set'
			];
			// The backend only lists products with available == true, so an
			// unset value is hidden on the site too.
			if (available !== true) parts.unshift('Hidden');
			return {
				title,
				subtitle: parts.join(' · '),
				media
			};
		}
	}
});

import type { Template } from 'sanity';
import type { StructureResolver } from 'sanity/structure';

// Desk structure: Products get a folder with per-category lists; every
// other document type (Gallery photo, Order, Testimonial, and anything
// added later) keeps the default list the Studio generated before this
// file existed.

const API_VERSION = '2025-01-01';

const DISPLAY_ORDER = [
	{ field: 'order', direction: 'asc' as const },
	{ field: 'name', direction: 'asc' as const }
];

export const NEW_SCREEN_TEMPLATE = 'product-screen';
export const NEW_CUSHION_COVER_TEMPLATE = 'product-cushion-cover';

// "New …" presets for the product lists and the global "Create" menu.
// Every product field is set explicitly so the result doesn't depend on
// how a template value merges with the schema's field initialValues.
export const productTemplates: Template[] = [
	{
		id: NEW_SCREEN_TEMPLATE,
		title: 'New folding screen',
		schemaType: 'product',
		value: { category: 'screen', available: true, order: 0 }
	},
	{
		id: NEW_CUSHION_COVER_TEMPLATE,
		title: 'New cushion cover',
		schemaType: 'product',
		value: {
			category: 'cushion-cover',
			dimensions: '60cm x 60cm',
			priceZar: 450,
			available: true,
			order: 0
		}
	}
];

export const structure: StructureResolver = (S) =>
	S.list()
		.title('Content')
		.items([
			S.listItem()
				.title('Products')
				.schemaType('product')
				.child(
					S.list()
						.title('Products')
						.items([
							S.listItem()
								.title('All products')
								.schemaType('product')
								.child(
									S.documentTypeList('product')
										.title('All products')
										.defaultOrdering(DISPLAY_ORDER)
										.initialValueTemplates([
											S.initialValueTemplateItem(NEW_SCREEN_TEMPLATE),
											S.initialValueTemplateItem(NEW_CUSHION_COVER_TEMPLATE)
										])
								),
							S.divider(),
							S.listItem()
								.title('Folding screens')
								.schemaType('product')
								.child(
									S.documentList()
										.title('Folding screens')
										.schemaType('product')
										.apiVersion(API_VERSION)
										// No stored category = legacy screen (backend coalesces the same way).
										.filter('_type == "product" && (category == "screen" || !defined(category))')
										.defaultOrdering(DISPLAY_ORDER)
										.initialValueTemplates([S.initialValueTemplateItem(NEW_SCREEN_TEMPLATE)])
								),
							S.listItem()
								.title('Cushion covers')
								.schemaType('product')
								.child(
									S.documentList()
										.title('Cushion covers')
										.schemaType('product')
										.apiVersion(API_VERSION)
										.filter('_type == "product" && category == "cushion-cover"')
										.defaultOrdering(DISPLAY_ORDER)
										.initialValueTemplates([
											S.initialValueTemplateItem(NEW_CUSHION_COVER_TEMPLATE)
										])
								)
						])
				),
			...S.documentTypeListItems().filter((item) => item.getId() !== 'product')
		]);

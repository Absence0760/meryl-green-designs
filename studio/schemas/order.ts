import { defineField, defineType } from 'sanity';
import {
	CustomerDetailsPanel,
	InternalNotesField,
	TrackingFields
} from '../components/orderPii';

export const order = defineType({
	name: 'order',
	title: 'Order',
	type: 'document',
	fields: [
		defineField({
			name: 'orderRef',
			title: 'Order reference',
			type: 'string',
			readOnly: true,
			validation: (rule) => rule.required()
		}),
		defineField({
			name: 'status',
			title: 'Status',
			type: 'string',
			options: {
				list: [
					{ title: 'Pending payment', value: 'pending_payment' },
					{ title: 'Payment received', value: 'payment_received' },
					{ title: 'Shipped', value: 'shipped' },
					{ title: 'Delivered', value: 'delivered' },
					{ title: 'Cancelled', value: 'cancelled' }
				],
				layout: 'radio'
			},
			initialValue: 'pending_payment',
			validation: (rule) => rule.required()
		}),

		// --- Payment ---
		defineField({
			name: 'paymentMethod',
			title: 'Payment method',
			type: 'string',
			options: {
				list: [
					{ title: 'EFT', value: 'eft' },
					{ title: 'PayFast', value: 'payfast' }
				]
			},
			initialValue: 'eft',
			readOnly: true
		}),
		defineField({
			name: 'amountZar',
			title: 'Amount (ZAR)',
			type: 'number',
			description: 'Total order amount in Rands.',
			readOnly: true
		}),
		defineField({
			name: 'paymentId',
			title: 'Payment ID',
			type: 'string',
			description: 'PayFast transaction ID (set automatically on payment).',
			readOnly: true
		}),

		// --- Customer ---
		defineField({
			name: 'customerName',
			title: 'Customer name',
			type: 'string'
		}),
		defineField({
			name: 'customerEmail',
			title: 'Customer email',
			type: 'string'
		}),
		defineField({
			name: 'customerPhone',
			title: 'Customer phone',
			type: 'string'
		}),
		defineField({
			name: 'shippingAddress',
			title: 'Shipping address',
			type: 'text',
			rows: 3
		}),

		defineField({
			name: 'items',
			title: 'Items',
			type: 'text',
			rows: 4,
			description: 'What the customer said they wanted (free text for now).'
		}),
		defineField({
			name: 'customerNotes',
			title: 'Customer notes',
			type: 'text',
			rows: 2
		}),

		defineField({
			name: 'trackingNumber',
			title: 'Tracking number',
			type: 'string',
			description: 'Fill in when marking as shipped.'
		}),
		defineField({
			name: 'trackingUrl',
			title: 'Tracking URL',
			type: 'url'
		}),
		defineField({
			name: 'shippingCarrier',
			title: 'Shipping carrier',
			type: 'string'
		}),

		defineField({
			name: 'internalNotes',
			title: 'Internal notes (never shown to customer)',
			type: 'text',
			rows: 3
		}),

		// --- DynamoDB-backed panels (Phase 0 dual-write validation) ---
		// These placeholder string fields exist only to give the custom
		// components a slot in the form layout — they never persist any
		// value to the Sanity document. The components fetch their data
		// from /admin/orders/:ref (DynamoDB). Native PII fields above stay
		// until Phase 1 cutover so the operator can eyeball parity.
		// See docs/orders-pii-split-plan.md.
		defineField({
			name: 'customerDetailsPanel',
			title: 'Customer details (DynamoDB)',
			type: 'string',
			components: { field: CustomerDetailsPanel as never }
		}),
		defineField({
			name: 'trackingPanel',
			title: 'Tracking (DynamoDB)',
			type: 'string',
			components: { field: TrackingFields as never }
		}),
		defineField({
			name: 'internalNotesPanel',
			title: 'Internal notes (DynamoDB)',
			type: 'string',
			components: { field: InternalNotesField as never }
		})
	],
	orderings: [
		{
			title: 'Newest first',
			name: 'createdDesc',
			by: [{ field: '_createdAt', direction: 'desc' }]
		},
		{
			title: 'Status',
			name: 'statusAsc',
			by: [{ field: 'status', direction: 'asc' }]
		}
	],
	preview: {
		select: {
			title: 'orderRef',
			subtitle: 'customerName',
			status: 'status'
		},
		prepare({ title, subtitle, status }) {
			return {
				title: `${title ?? 'New order'} — ${subtitle ?? 'Unknown'}`,
				subtitle: `Status: ${status ?? 'pending_payment'}`
			};
		}
	}
});

import { defineField, defineType } from 'sanity';
import {
	CustomerDetailsPanel,
	InternalNotesField,
	TrackingFields
} from '../components/orderPii';

// Phase 1 schema: Sanity holds only the non-PII order skeleton. Customer
// details, items, tracking, and internal notes all live in DynamoDB and
// are rendered via the three custom panels below — these panels fetch
// from /admin/orders/:ref and write back through PATCH endpoints. The
// previous native Sanity PII fields (customerName, customerEmail,
// customerPhone, shippingAddress, items, customerNotes, internalNotes,
// trackingNumber, trackingUrl, shippingCarrier) were removed at the
// Phase 1 cutover; existing docs were stripped of those values by
// `pnpm scrub:sanity-pii --prod --yes`. See docs/orders-pii-split-plan.md.
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

		// --- Payment (non-PII; lives in Sanity) ---
		defineField({
			name: 'paymentMethod',
			title: 'Payment method',
			type: 'string',
			options: {
				list: [{ title: 'PayFast', value: 'payfast' }]
			},
			initialValue: 'payfast',
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

		// --- DynamoDB-backed panels ---
		// These placeholder string fields exist only to give the custom
		// components a slot in the form layout — they never persist any
		// value to the Sanity document. The components fetch their data
		// from /admin/orders/:ref (DynamoDB) and save back through PATCH
		// endpoints.
		defineField({
			name: 'customerDetailsPanel',
			title: 'Customer details',
			type: 'string',
			components: { field: CustomerDetailsPanel as never }
		}),
		defineField({
			name: 'trackingPanel',
			title: 'Tracking',
			type: 'string',
			components: { field: TrackingFields as never }
		}),
		defineField({
			name: 'internalNotesPanel',
			title: 'Internal notes',
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
			status: 'status'
		},
		prepare({ title, status }) {
			// Customer name lives in DynamoDB now; the list preview keeps
			// just the orderRef + status to avoid a per-row DynamoDB read.
			return {
				title: title ?? 'New order',
				subtitle: `Status: ${status ?? 'pending_payment'}`
			};
		}
	}
});

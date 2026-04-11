import { escapeHtml } from './email.js';
import type { OrderStatus, SanityOrder } from './sanity.js';

export type OwnerNotificationInput = {
	orderRef: string;
	name: string;
	email: string;
	phone: string;
	address: string;
	items: string;
	notes: string;
};

function siteUrl(): string {
	return process.env.SITE_URL ?? 'http://localhost:7777';
}

function trackingLink(order: { orderRef: string; customerEmail: string }): string {
	const base = siteUrl().replace(/\/$/, '');
	const ref = encodeURIComponent(order.orderRef);
	const email = encodeURIComponent(order.customerEmail);
	return `${base}/track?ref=${ref}&email=${email}`;
}

// Banking details are injected from Lambda env vars at send time so they
// never live in git and never appear on public pages. If any of the four
// fields is missing (e.g. the Lambda hasn't been configured yet), we render a
// graceful fallback that still tells the customer how to proceed rather than
// a half-filled card.
function bankingDetailsHtml(ref: string): string {
	const accountName = process.env.BANK_ACCOUNT_NAME;
	const bankName = process.env.BANK_NAME;
	const accountNumber = process.env.BANK_ACCOUNT_NUMBER;
	const branchCode = process.env.BANK_BRANCH_CODE;

	if (!accountName || !bankName || !accountNumber || !branchCode) {
		console.warn('Banking env vars are not fully configured — sending fallback copy.');
		return `
			<h3>Banking details</h3>
			<p>Please reply to this email and we'll send our banking details so you
			can complete payment. Use <strong>${escapeHtml(ref)}</strong> as your
			payment reference.</p>
		`;
	}

	return `
		<h3>Banking details</h3>
		<p>
			Account name: ${escapeHtml(accountName)}<br>
			Bank: ${escapeHtml(bankName)}<br>
			Account number: ${escapeHtml(accountNumber)}<br>
			Branch code: ${escapeHtml(branchCode)}<br>
			Reference: ${escapeHtml(ref)}
		</p>
	`;
}

export function ownerNotification(input: OwnerNotificationInput): { subject: string; html: string } {
	return {
		subject: `New order ${input.orderRef} — ${input.name}`,
		html: `
			<h2>New order — ${escapeHtml(input.orderRef)}</h2>
			<p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
			<p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
			<p><strong>Phone:</strong> ${escapeHtml(input.phone) || '(not provided)'}</p>
			<p><strong>Shipping address:</strong><br>${escapeHtml(input.address).replace(/\n/g, '<br>')}</p>
			<h3>Items</h3>
			<pre style="font-family: inherit; white-space: pre-wrap;">${escapeHtml(input.items)}</pre>
			${input.notes ? `<h3>Notes</h3><p>${escapeHtml(input.notes).replace(/\n/g, '<br>')}</p>` : ''}
			<p>This order has been saved to the Studio. Update its status there to trigger customer emails automatically.</p>
		`
	};
}

function pendingPaymentTemplate(order: SanityOrder): { subject: string; html: string } {
	return {
		subject: `Order confirmation ${order.orderRef} — Meryl Green Designs`,
		html: `
			<h2>Thank you for your order</h2>
			<p>Hi ${escapeHtml(order.customerName)},</p>
			<p>We've received your order request. Your reference number is:</p>
			<p style="font-size: 1.25rem;"><strong>${escapeHtml(order.orderRef)}</strong></p>
			<p>Please make payment by Electronic Funds Transfer using the banking details
			below, and use <strong>${escapeHtml(order.orderRef)}</strong> as your payment
			reference.</p>
			${bankingDetailsHtml(order.orderRef)}
			<p>Your order will be shipped once payment reflects in the account. You can
			check the status of your order at any time here:</p>
			<p><a href="${trackingLink(order)}">${trackingLink(order)}</a></p>
			<p>— Meryl Green Designs</p>
		`
	};
}

function paymentReceivedTemplate(order: SanityOrder): { subject: string; html: string } {
	return {
		subject: `Payment received — order ${order.orderRef}`,
		html: `
			<h2>Payment received</h2>
			<p>Hi ${escapeHtml(order.customerName)},</p>
			<p>Thank you — we've confirmed your payment for order
			<strong>${escapeHtml(order.orderRef)}</strong>. We'll be shipping your items
			shortly and will send another email once they're on their way.</p>
			<p>You can check the status of your order at any time here:</p>
			<p><a href="${trackingLink(order)}">${trackingLink(order)}</a></p>
			<p>— Meryl Green Designs</p>
		`
	};
}

function shippedTemplate(order: SanityOrder): { subject: string; html: string } {
	const trackingInfo =
		order.trackingNumber || order.trackingUrl
			? `
				<h3>Tracking</h3>
				${order.shippingCarrier ? `<p><strong>Carrier:</strong> ${escapeHtml(order.shippingCarrier)}</p>` : ''}
				${order.trackingNumber ? `<p><strong>Tracking number:</strong> ${escapeHtml(order.trackingNumber)}</p>` : ''}
				${order.trackingUrl ? `<p><a href="${escapeHtml(order.trackingUrl)}">Track your parcel</a></p>` : ''}
			`
			: '';

	return {
		subject: `Your order ${order.orderRef} has shipped`,
		html: `
			<h2>Your order is on its way</h2>
			<p>Hi ${escapeHtml(order.customerName)},</p>
			<p>Good news — order <strong>${escapeHtml(order.orderRef)}</strong> has
			been shipped.</p>
			${trackingInfo}
			<p>You can check the status of your order at any time here:</p>
			<p><a href="${trackingLink(order)}">${trackingLink(order)}</a></p>
			<p>— Meryl Green Designs</p>
		`
	};
}

function deliveredTemplate(order: SanityOrder): { subject: string; html: string } {
	return {
		subject: `Order ${order.orderRef} delivered`,
		html: `
			<h2>Delivered</h2>
			<p>Hi ${escapeHtml(order.customerName)},</p>
			<p>Your order <strong>${escapeHtml(order.orderRef)}</strong> has been
			marked as delivered. We hope you love it!</p>
			<p>If anything isn't right, just reply to this email.</p>
			<p>— Meryl Green Designs</p>
		`
	};
}

function cancelledTemplate(order: SanityOrder): { subject: string; html: string } {
	return {
		subject: `Order ${order.orderRef} cancelled`,
		html: `
			<h2>Order cancelled</h2>
			<p>Hi ${escapeHtml(order.customerName)},</p>
			<p>Your order <strong>${escapeHtml(order.orderRef)}</strong> has been
			cancelled. If you've already paid, we'll reach out separately to arrange
			a refund. If you have any questions, just reply to this email.</p>
			<p>— Meryl Green Designs</p>
		`
	};
}

const STATUS_TEMPLATES: Record<OrderStatus, (order: SanityOrder) => { subject: string; html: string } | null> = {
	pending_payment: pendingPaymentTemplate,
	payment_received: paymentReceivedTemplate,
	shipped: shippedTemplate,
	delivered: deliveredTemplate,
	cancelled: cancelledTemplate
};

export function customerEmailForStatus(order: SanityOrder): { subject: string; html: string } | null {
	const template = STATUS_TEMPLATES[order.status];
	if (!template) return null;
	return template(order);
}

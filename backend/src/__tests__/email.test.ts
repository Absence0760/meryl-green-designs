import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml, sendEmail } from '../email.js';
import {
	ownerNotification,
	customerEmailForStatus
} from '../email-templates.js';
import type { SanityOrder } from '../sanity.js';

describe('escapeHtml', () => {
	it('escapes the five dangerous HTML characters', () => {
		expect(escapeHtml('&')).toBe('&amp;');
		expect(escapeHtml('<')).toBe('&lt;');
		expect(escapeHtml('>')).toBe('&gt;');
		expect(escapeHtml('"')).toBe('&quot;');
		expect(escapeHtml("'")).toBe('&#39;');
	});

	it('leaves safe text untouched', () => {
		expect(escapeHtml('Hello world')).toBe('Hello world');
		expect(escapeHtml('123.456')).toBe('123.456');
	});

	it('escapes a full XSS payload', () => {
		const evil = '<script>alert("xss")</script>';
		const safe = escapeHtml(evil);
		expect(safe).not.toContain('<script>');
		expect(safe).toContain('&lt;script&gt;');
		expect(safe).toContain('&quot;xss&quot;');
	});

	it('escapes ampersands first so entity sequences are safe', () => {
		// If & were escaped last, & + amp; would produce &amp;amp;
		expect(escapeHtml('&amp;')).toBe('&amp;amp;');
	});
});

// Helper to build a test order document matching the SanityOrder shape.
function makeOrder(overrides: Partial<SanityOrder> = {}): SanityOrder {
	return {
		_id: 'abc123',
		_type: 'order',
		_createdAt: '2026-04-10T12:00:00Z',
		_updatedAt: '2026-04-10T12:00:00Z',
		orderRef: 'MG-260410-ABCD',
		status: 'pending_payment',
		customerName: 'Jane Smith',
		customerEmail: 'jane@example.com',
		customerPhone: null,
		shippingAddress: '1 Test Street',
		items: '1 x Small Screen',
		customerNotes: null,
		trackingNumber: null,
		trackingUrl: null,
		shippingCarrier: null,
		...overrides
	};
}

describe('ownerNotification', () => {
	it('includes the order reference, customer details, and items', () => {
		const mail = ownerNotification({
			orderRef: 'MG-260410-ABCD',
			name: 'Jane Smith',
			email: 'jane@example.com',
			phone: '0123456789',
			address: '1 Test Street',
			items: '1 x Small Screen',
			notes: 'Please gift-wrap'
		});
		expect(mail.subject).toContain('MG-260410-ABCD');
		expect(mail.subject).toContain('Jane Smith');
		expect(mail.html).toContain('MG-260410-ABCD');
		expect(mail.html).toContain('Jane Smith');
		expect(mail.html).toContain('jane@example.com');
		expect(mail.html).toContain('0123456789');
		expect(mail.html).toContain('1 Test Street');
		expect(mail.html).toContain('1 x Small Screen');
		expect(mail.html).toContain('Please gift-wrap');
	});

	it('shows "(not provided)" for missing phone', () => {
		const mail = ownerNotification({
			orderRef: 'MG-1',
			name: 'x',
			email: 'x@y.z',
			phone: '',
			address: 'a',
			items: 'b',
			notes: ''
		});
		expect(mail.html).toContain('(not provided)');
	});

	it('omits the notes section when notes are empty', () => {
		const mail = ownerNotification({
			orderRef: 'MG-1',
			name: 'x',
			email: 'x@y.z',
			phone: '',
			address: 'a',
			items: 'b',
			notes: ''
		});
		expect(mail.html).not.toContain('<h3>Notes</h3>');
	});

	it('escapes HTML in customer-supplied fields', () => {
		const mail = ownerNotification({
			orderRef: 'MG-1',
			name: '<script>alert(1)</script>',
			email: 'x@y.z',
			phone: '',
			address: '',
			items: '',
			notes: ''
		});
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
	});

	it('prompts the owner to reply manually with banking details', () => {
		// The customer gets only an acknowledgement — the owner is the gate
		// that sends banking details, so the notification must make that
		// action explicit.
		const mail = ownerNotification({
			orderRef: 'MG-1',
			name: 'Jane',
			email: 'jane@example.com',
			phone: '',
			address: 'a',
			items: 'b',
			notes: ''
		});
		expect(mail.html.toLowerCase()).toMatch(/banking details/);
		expect(mail.html.toLowerCase()).toMatch(/reply/);
	});
});

describe('customerEmailForStatus', () => {
	it('returns a pending-payment acknowledgement for a new order', () => {
		const mail = customerEmailForStatus(makeOrder({ status: 'pending_payment' }));
		expect(mail).not.toBeNull();
		expect(mail!.subject).toContain('MG-260410-ABCD');
		expect(mail!.html).toContain('MG-260410-ABCD');
		// Acknowledgement tone, not "here's how to pay".
		expect(mail!.html.toLowerCase()).toMatch(/received|thank/);
		// Customer is told to expect a manual reply with banking details.
		expect(mail!.html.toLowerCase()).toMatch(/reply|follow up|get back|separate/);
	});

	it('never leaks banking details in the pending-payment email', () => {
		// Regression guard: banking details must be sent manually by the owner,
		// never by the automated confirmation. Any value that looks like a bank
		// field leaking into the template is a critical bug.
		const mail = customerEmailForStatus(makeOrder({ status: 'pending_payment' }));
		expect(mail!.html).not.toMatch(/account\s*number/i);
		expect(mail!.html).not.toMatch(/branch\s*code/i);
		expect(mail!.html).not.toMatch(/\[\s*to be provided\s*\]/i);
	});

	it('returns a payment-received template', () => {
		const mail = customerEmailForStatus(makeOrder({ status: 'payment_received' }));
		expect(mail!.subject.toLowerCase()).toContain('payment received');
		expect(mail!.html).toContain('Payment received');
		expect(mail!.html).toContain("confirmed your payment");
	});

	it('returns a shipped template with tracking info when present', () => {
		const mail = customerEmailForStatus(
			makeOrder({
				status: 'shipped',
				trackingNumber: 'CG123456',
				trackingUrl: 'https://example.com/track/CG123456',
				shippingCarrier: 'Courier Guy'
			})
		);
		expect(mail!.html).toContain('Courier Guy');
		expect(mail!.html).toContain('CG123456');
		expect(mail!.html).toContain('https://example.com/track/CG123456');
	});

	it('returns a shipped template without a tracking block when info is missing', () => {
		const mail = customerEmailForStatus(makeOrder({ status: 'shipped' }));
		expect(mail!.html).not.toContain('<h3>Tracking</h3>');
	});

	it('returns a delivered template', () => {
		const mail = customerEmailForStatus(makeOrder({ status: 'delivered' }));
		expect(mail!.subject.toLowerCase()).toContain('delivered');
		expect(mail!.html).toContain('hope you love it');
	});

	it('returns a cancelled template', () => {
		const mail = customerEmailForStatus(makeOrder({ status: 'cancelled' }));
		expect(mail!.subject.toLowerCase()).toContain('cancelled');
	});

	it('all customer emails include a tracking link using SITE_URL', () => {
		for (const status of [
			'pending_payment',
			'payment_received',
			'shipped'
		] as const) {
			const mail = customerEmailForStatus(makeOrder({ status }));
			expect(mail!.html).toContain('http://localhost:7777/track');
			expect(mail!.html).toContain('ref=MG-260410-ABCD');
			expect(mail!.html).toContain('email=jane%40example.com');
		}
	});

	it('escapes HTML in customer-supplied names', () => {
		const mail = customerEmailForStatus(
			makeOrder({ customerName: '<img src=x onerror=alert(1)>' })
		);
		expect(mail!.html).not.toContain('<img src=x');
		expect(mail!.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});
});

describe('sendEmail', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	function okResponse() {
		return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
	}

	it('POSTs to the Resend API with the expected body', async () => {
		fetchMock.mockResolvedValueOnce(okResponse());

		await sendEmail({
			to: 'jane@example.com',
			subject: 'Hi',
			html: '<p>Hello</p>'
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://api.resend.com/emails');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer test-resend-key');
		expect(init.headers['Content-Type']).toBe('application/json');
		const body = JSON.parse(init.body);
		expect(body).toMatchObject({
			from: 'Meryl Green Designs <test@example.com>',
			to: 'jane@example.com',
			subject: 'Hi',
			html: '<p>Hello</p>'
		});
		// No replyTo passed → no reply_to field should be set.
		expect(body).not.toHaveProperty('reply_to');
	});

	it('includes reply_to only when replyTo is provided', async () => {
		fetchMock.mockResolvedValueOnce(okResponse());

		await sendEmail({
			to: 'owner@example.com',
			subject: 'Hi',
			html: '<p>Hello</p>',
			replyTo: 'customer@example.com'
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
		expect(body.reply_to).toBe('customer@example.com');
	});

	it('throws when RESEND_API_KEY is missing', async () => {
		vi.stubEnv('RESEND_API_KEY', '');

		await expect(
			sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
		).rejects.toThrow(/not configured/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws when FROM_EMAIL is missing', async () => {
		vi.stubEnv('FROM_EMAIL', '');

		await expect(
			sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
		).rejects.toThrow(/not configured/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws with the status code when Resend returns a non-OK response', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('{"message":"bad auth"}', { status: 401 })
		);

		await expect(
			sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
		).rejects.toThrow(/401/);
	});
});

import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
	generateSignature,
	buildPaymentFormData,
	validateItn,
	type PayFastConfig,
	type PaymentFormInput
} from '../payfast.js';

const testConfig: PayFastConfig = {
	merchantId: '10004002',
	merchantKey: 'q1cd2rdny4a53',
	passphrase: 'payfast',
	sandbox: true
};

const testInput: PaymentFormInput = {
	orderRef: 'MG-260413-AB12',
	amountZar: 450,
	itemName: 'Meryl Green Designs order MG-260413-AB12',
	customerName: 'Jane Smith',
	customerEmail: 'jane@example.com',
	returnUrl: 'http://localhost:7777/payment/complete?ref=MG-260413-AB12',
	cancelUrl: 'http://localhost:7777/payment/cancelled?ref=MG-260413-AB12',
	notifyUrl: 'http://localhost:3001/webhooks/payfast-itn'
};

describe('generateSignature', () => {
	it('produces a 32-char hex MD5 hash', () => {
		const sig = generateSignature({ amount: '100.00', item_name: 'Test' }, 'payfast');
		expect(sig).toMatch(/^[a-f0-9]{32}$/);
	});

	it('is deterministic for the same input', () => {
		const data = { merchant_id: '10004002', amount: '450.00' };
		const a = generateSignature(data, 'payfast');
		const b = generateSignature(data, 'payfast');
		expect(a).toBe(b);
	});

	it('changes when the passphrase changes', () => {
		const data = { amount: '100.00' };
		const a = generateSignature(data, 'passA');
		const b = generateSignature(data, 'passB');
		expect(a).not.toBe(b);
	});

	it('changes when the data changes', () => {
		const a = generateSignature({ amount: '100.00' }, 'payfast');
		const b = generateSignature({ amount: '200.00' }, 'payfast');
		expect(a).not.toBe(b);
	});

	it('filters out empty-string values', () => {
		const withEmpty = generateSignature({ amount: '100.00', name_last: '' }, 'payfast');
		const without = generateSignature({ amount: '100.00' }, 'payfast');
		expect(withEmpty).toBe(without);
	});

	it('works without a passphrase', () => {
		const sig = generateSignature({ amount: '100.00' }, null);
		expect(sig).toMatch(/^[a-f0-9]{32}$/);
	});
});

describe('buildPaymentFormData', () => {
	it('returns sandbox URL when sandbox is true', () => {
		const result = buildPaymentFormData(testConfig, testInput);
		expect(result.action).toBe('https://sandbox.payfast.co.za/eng/process');
	});

	it('returns live URL when sandbox is false', () => {
		const liveConfig = { ...testConfig, sandbox: false };
		const result = buildPaymentFormData(liveConfig, testInput);
		expect(result.action).toBe('https://www.payfast.co.za/eng/process');
	});

	it('includes required PayFast fields', () => {
		const result = buildPaymentFormData(testConfig, testInput);
		expect(result.fields.merchant_id).toBe('10004002');
		expect(result.fields.merchant_key).toBe('q1cd2rdny4a53');
		expect(result.fields.amount).toBe('450.00');
		expect(result.fields.item_name).toContain('MG-260413-AB12');
		expect(result.fields.m_payment_id).toBe('MG-260413-AB12');
		expect(result.fields.email_address).toBe('jane@example.com');
		expect(result.fields.return_url).toContain('/payment/complete');
		expect(result.fields.cancel_url).toContain('/payment/cancelled');
		expect(result.fields.notify_url).toContain('/webhooks/payfast-itn');
	});

	it('includes a signature field', () => {
		const result = buildPaymentFormData(testConfig, testInput);
		expect(result.fields.signature).toMatch(/^[a-f0-9]{32}$/);
	});

	it('formats amount to two decimal places', () => {
		const input = { ...testInput, amountZar: 1234.5 };
		const result = buildPaymentFormData(testConfig, input);
		expect(result.fields.amount).toBe('1234.50');
	});

	it('splits customer name into first and last', () => {
		const result = buildPaymentFormData(testConfig, testInput);
		expect(result.fields.name_first).toBe('Jane');
		expect(result.fields.name_last).toBe('Smith');
	});

	it('handles single-word names', () => {
		const input = { ...testInput, customerName: 'Madonna' };
		const result = buildPaymentFormData(testConfig, input);
		expect(result.fields.name_first).toBe('Madonna');
		expect(result.fields.name_last).toBeUndefined();
	});

	it('orders fields per PayFast spec so the signature verifies server-side', () => {
		// PayFast verifies the signature using fields in their documented
		// order. If name_last lands anywhere other than between name_first
		// and email_address, PayFast responds with "Generated signature
		// does not match submitted signature" and the payment fails.
		const result = buildPaymentFormData(testConfig, testInput);
		const keys = Object.keys(result.fields);
		expect(keys).toEqual([
			'merchant_id',
			'merchant_key',
			'return_url',
			'cancel_url',
			'notify_url',
			'name_first',
			'name_last',
			'email_address',
			'm_payment_id',
			'amount',
			'item_name',
			'signature'
		]);
	});

	it('omits name_last from the ordering when absent', () => {
		const input = { ...testInput, customerName: 'Madonna' };
		const result = buildPaymentFormData(testConfig, input);
		const keys = Object.keys(result.fields);
		expect(keys).toEqual([
			'merchant_id',
			'merchant_key',
			'return_url',
			'cancel_url',
			'notify_url',
			'name_first',
			'email_address',
			'm_payment_id',
			'amount',
			'item_name',
			'signature'
		]);
	});
});

describe('validateItn', () => {
	const pfEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');

	/**
	 * Build a raw ITN body the way PayFast does: URL-encoded key=value pairs
	 * joined with `&`, a trailing `&signature=<md5>` computed over
	 * `<body>&passphrase=<urlencoded>`. Matching PayFast's serialisation is
	 * the whole point of the raw-body verification path.
	 */
	function buildRawItn(
		passphrase: string | null = 'payfast',
		overrides: Record<string, string> = {}
	): string {
		const fields: Record<string, string> = {
			m_payment_id: 'MG-260413-AB12',
			pf_payment_id: '1234567',
			payment_status: 'COMPLETE',
			item_name: 'Meryl Green Designs order MG-260413-AB12',
			amount_gross: '450.00',
			amount_fee: '-14.40',
			amount_net: '435.60',
			merchant_id: '10004002',
			...overrides
		};
		const body = Object.entries(fields)
			.map(([k, v]) => `${k}=${pfEncode(v)}`)
			.join('&');
		const sigInput = passphrase ? `${body}&passphrase=${pfEncode(passphrase.trim())}` : body;
		const signature = createHash('md5').update(sigInput).digest('hex');
		return `${body}&signature=${signature}`;
	}

	it('returns valid=true for a correctly signed payload', () => {
		const raw = buildRawItn('payfast');
		const result = validateItn(raw, 'payfast');
		expect(result.valid).toBe(true);
		expect(result.paymentStatus).toBe('COMPLETE');
		expect(result.pfPaymentId).toBe('1234567');
		expect(result.amountGross).toBe(450);
		expect(result.orderRef).toBe('MG-260413-AB12');
	});

	it('returns valid=true for a payload containing empty fields (PayFast pattern)', () => {
		// PayFast sends item_description, custom_str1-5, custom_int1-5, and
		// name_last as empty strings even when unused — and INCLUDES them in
		// the signed string. Re-encoding from a parsed body would drop these
		// and produce a mismatch. The raw-body verifier handles them by
		// virtue of MD5-ing the exact bytes PayFast sent.
		const raw = buildRawItn('payfast', {
			item_description: '',
			custom_str1: '',
			custom_str2: '',
			custom_int1: '',
			name_first: 'test',
			name_last: '',
			email_address: 'test@example.com'
		});
		const result = validateItn(raw, 'payfast');
		expect(result.valid).toBe(true);
	});

	it('returns valid=false for a tampered signature', () => {
		const raw = buildRawItn('payfast').replace(/&signature=[a-f0-9]+$/, `&signature=${'a'.repeat(32)}`);
		const result = validateItn(raw, 'payfast');
		expect(result.valid).toBe(false);
	});

	it('returns valid=false for a wrong passphrase', () => {
		const raw = buildRawItn('payfast');
		const result = validateItn(raw, 'wrong-passphrase');
		expect(result.valid).toBe(false);
	});

	it('returns valid=false when the amount is tampered', () => {
		// Signature was computed over amount_gross=450.00; tampering the raw
		// bytes must invalidate it even though the mutation preserves field order.
		const raw = buildRawItn('payfast').replace('amount_gross=450.00', 'amount_gross=999.00');
		const result = validateItn(raw, 'payfast');
		expect(result.valid).toBe(false);
	});

	it('parses amount_gross as a number', () => {
		const raw = buildRawItn('payfast');
		const result = validateItn(raw, 'payfast');
		expect(typeof result.amountGross).toBe('number');
	});

	it('handles an unsigned/empty body gracefully', () => {
		const result = validateItn('signature=abc', 'payfast');
		expect(result.valid).toBe(false);
		expect(result.paymentStatus).toBe('');
		expect(result.pfPaymentId).toBe('');
		expect(result.amountGross).toBe(0);
		expect(result.orderRef).toBe('');
	});

	it('verifies without a passphrase when none is configured', () => {
		const raw = buildRawItn(null);
		const result = validateItn(raw, null);
		expect(result.valid).toBe(true);
	});
});

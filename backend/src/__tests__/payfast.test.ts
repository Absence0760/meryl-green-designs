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
});

describe('validateItn', () => {
	function buildValidItnBody(): Record<string, string> {
		const body: Record<string, string> = {
			m_payment_id: 'MG-260413-AB12',
			pf_payment_id: '1234567',
			payment_status: 'COMPLETE',
			item_name: 'Meryl Green Designs order MG-260413-AB12',
			amount_gross: '450.00',
			amount_fee: '-14.40',
			amount_net: '435.60',
			merchant_id: '10004002'
		};
		body.signature = generateSignature(body, 'payfast');
		return body;
	}

	it('returns valid=true for a correctly signed payload', () => {
		const body = buildValidItnBody();
		const result = validateItn(body, 'payfast');
		expect(result.valid).toBe(true);
		expect(result.paymentStatus).toBe('COMPLETE');
		expect(result.pfPaymentId).toBe('1234567');
		expect(result.amountGross).toBe(450);
		expect(result.orderRef).toBe('MG-260413-AB12');
	});

	it('returns valid=false for a tampered signature', () => {
		const body = buildValidItnBody();
		body.signature = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		const result = validateItn(body, 'payfast');
		expect(result.valid).toBe(false);
	});

	it('returns valid=false for a wrong passphrase', () => {
		const body = buildValidItnBody();
		const result = validateItn(body, 'wrong-passphrase');
		expect(result.valid).toBe(false);
	});

	it('returns valid=false when the amount is tampered', () => {
		const body = buildValidItnBody();
		body.amount_gross = '999.00';
		// signature was computed with 450.00, so it no longer matches
		const result = validateItn(body, 'payfast');
		expect(result.valid).toBe(false);
	});

	it('parses amount_gross as a number', () => {
		const body = buildValidItnBody();
		const result = validateItn(body, 'payfast');
		expect(typeof result.amountGross).toBe('number');
	});

	it('handles missing fields gracefully', () => {
		const result = validateItn({ signature: 'abc' }, 'payfast');
		expect(result.valid).toBe(false);
		expect(result.paymentStatus).toBe('');
		expect(result.pfPaymentId).toBe('');
		expect(result.amountGross).toBe(0);
		expect(result.orderRef).toBe('');
	});
});

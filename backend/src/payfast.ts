import { createHash } from 'crypto';

export type PayFastConfig = {
	merchantId: string;
	merchantKey: string;
	passphrase: string;
	sandbox: boolean;
};

export type PaymentFormInput = {
	orderRef: string;
	amountZar: number;
	itemName: string;
	customerName: string;
	customerEmail: string;
	returnUrl: string;
	cancelUrl: string;
	notifyUrl: string;
};

export type PaymentFormData = {
	action: string;
	fields: Record<string, string>;
};

export type ItnPayload = Record<string, string>;

export type ItnResult = {
	valid: boolean;
	paymentStatus: string;
	pfPaymentId: string;
	amountGross: number;
	orderRef: string;
};

const PAYFAST_LIVE_URL = 'https://www.payfast.co.za/eng/process';
const PAYFAST_SANDBOX_URL = 'https://sandbox.payfast.co.za/eng/process';

/**
 * Generate a PayFast signature (MD5 of URL-encoded key=value pairs with
 * passphrase appended). Keys are kept in insertion order per PayFast docs —
 * the signature string must follow their prescribed field order, not
 * alphabetical sort.
 */
export function generateSignature(
	data: Record<string, string>,
	passphrase: string | null
): string {
	const pairs = Object.entries(data)
		.filter(([, v]) => v !== '')
		.map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`);

	const sigString = passphrase
		? [...pairs, `passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`].join('&')
		: pairs.join('&');

	return createHash('md5').update(sigString).digest('hex');
}

/**
 * Build the form data needed to redirect a customer to PayFast's hosted
 * payment page.
 */
export function buildPaymentFormData(
	config: PayFastConfig,
	input: PaymentFormInput
): PaymentFormData {
	const data: Record<string, string> = {
		merchant_id: config.merchantId,
		merchant_key: config.merchantKey,
		return_url: input.returnUrl,
		cancel_url: input.cancelUrl,
		notify_url: input.notifyUrl,
		name_first: input.customerName.split(' ')[0] || '',
		email_address: input.customerEmail,
		m_payment_id: input.orderRef,
		amount: input.amountZar.toFixed(2),
		item_name: input.itemName
	};

	const lastName = input.customerName.split(' ').slice(1).join(' ');
	if (lastName) {
		data.name_last = lastName;
	}

	const signature = generateSignature(data, config.passphrase);
	data.signature = signature;

	return {
		action: config.sandbox ? PAYFAST_SANDBOX_URL : PAYFAST_LIVE_URL,
		fields: data
	};
}

/**
 * Validate an ITN (Instant Transaction Notification) callback from PayFast.
 * Returns the parsed result. The caller is responsible for checking the
 * amount against the stored order and updating the order status.
 */
export function validateItn(
	body: ItnPayload,
	passphrase: string | null
): ItnResult {
	const { signature: receivedSig, ...dataWithoutSig } = body;

	const expectedSig = generateSignature(dataWithoutSig, passphrase);
	const valid = receivedSig === expectedSig;

	return {
		valid,
		paymentStatus: body.payment_status ?? '',
		pfPaymentId: body.pf_payment_id ?? '',
		amountGross: parseFloat(body.amount_gross ?? '0'),
		orderRef: body.m_payment_id ?? ''
	};
}

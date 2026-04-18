import { createHash, timingSafeEqual } from 'crypto';

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
	// PayFast verifies the signature over fields in the order documented in
	// their integration guide: merchant_id, merchant_key, return_url,
	// cancel_url, notify_url, name_first, name_last, email_address,
	// m_payment_id, amount, item_name. JS object insertion order is
	// preserved, so build the object in that exact order — putting
	// name_last anywhere else produces a signature PayFast will reject.
	const firstName = input.customerName.split(' ')[0] || '';
	const lastName = input.customerName.split(' ').slice(1).join(' ');

	const data: Record<string, string> = {
		merchant_id: config.merchantId,
		merchant_key: config.merchantKey,
		return_url: input.returnUrl,
		cancel_url: input.cancelUrl,
		notify_url: input.notifyUrl,
		name_first: firstName,
		...(lastName ? { name_last: lastName } : {}),
		email_address: input.customerEmail,
		m_payment_id: input.orderRef,
		amount: input.amountZar.toFixed(2),
		item_name: input.itemName
	};

	const signature = generateSignature(data, config.passphrase);
	data.signature = signature;

	return {
		action: config.sandbox ? PAYFAST_SANDBOX_URL : PAYFAST_LIVE_URL,
		fields: data
	};
}

/**
 * Validate an ITN (Instant Transaction Notification) callback from PayFast.
 *
 * Takes the **raw** URL-encoded POST body. The signature MUST be verified
 * against the raw bytes PayFast sent, not a re-encoded parsed form — PayFast
 * signs using PHP's `urlencode` (which encodes `!*'()` that JS's
 * `encodeURIComponent` leaves alone) and includes empty-value fields in the
 * signature string. Parsing and re-encoding would drop both properties and
 * produce a signature that never matches.
 *
 * The caller is responsible for checking the amount against the stored order
 * and updating the order status.
 */
export function validateItn(rawBody: string, passphrase: string | null): ItnResult {
	const body = Object.fromEntries(new URLSearchParams(rawBody));
	const receivedSig = body.signature ?? '';

	// Strip the signature field from the raw body, preserving everything else
	// byte-for-byte. PayFast always sends signature as the final param, but
	// handle both "&signature=..." and "signature=..." at the start defensively.
	const stripped = rawBody.replace(/(^|&)signature=[^&]*/, '').replace(/^&/, '');

	const sigString = passphrase
		? `${stripped}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
		: stripped;

	const expectedSig = createHash('md5').update(sigString).digest('hex');
	const valid =
		receivedSig.length === expectedSig.length &&
		timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig));

	return {
		valid,
		paymentStatus: body.payment_status ?? '',
		pfPaymentId: body.pf_payment_id ?? '',
		amountGross: parseFloat(body.amount_gross ?? '0'),
		orderRef: body.m_payment_id ?? ''
	};
}

import { createHash } from 'node:crypto';

// Build a signed PayFast ITN request body that the backend's
// validateItn() will accept. Mirrors backend/src/payfast.ts exactly —
// if that file changes the signature scheme, this helper has to track
// it (the e2e suite is the one that would catch the regression).

function phpUrlEncode(value: string): string {
	return encodeURIComponent(value)
		.replace(/%20/g, '+')
		.replace(/!/g, '%21')
		.replace(/\*/g, '%2A')
		.replace(/'/g, '%27')
		.replace(/\(/g, '%28')
		.replace(/\)/g, '%29')
		.replace(/~/g, '%7E');
}

export type ItnPayload = {
	m_payment_id: string;          // orderRef
	pf_payment_id: string;          // PayFast's id
	payment_status: 'COMPLETE' | 'FAILED' | 'CANCELLED';
	amount_gross: string;           // "1234.56"
	merchant_id?: string;
	[key: string]: string | undefined;
};

/**
 * Build the URL-encoded body PayFast would POST to /webhooks/payfast-itn,
 * including a valid signature appended as the final field.
 *
 * The backend validates the signature over the raw body before parsing,
 * so this helper builds the same byte sequence PayFast would.
 */
export function buildSignedItn(payload: ItnPayload, passphrase: string): string {
	const merchantId = process.env.PAYFAST_MERCHANT_ID;
	if (!merchantId) throw new Error('[sign-payfast-itn] PAYFAST_MERCHANT_ID unset');

	const body: Record<string, string> = {
		merchant_id: merchantId,
		...Object.fromEntries(
			Object.entries(payload).filter(([, v]) => v !== undefined) as [string, string][],
		),
	};

	const pairs = Object.entries(body)
		.filter(([, v]) => v !== '')
		.map(([k, v]) => `${k}=${phpUrlEncode(String(v).trim())}`);

	const sigString = `${pairs.join('&')}&passphrase=${phpUrlEncode(passphrase.trim())}`;
	const signature = createHash('md5').update(sigString).digest('hex');

	return `${pairs.join('&')}&signature=${signature}`;
}

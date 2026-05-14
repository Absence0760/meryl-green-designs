import { createHmac } from 'node:crypto';

// Build the `sanity-webhook-signature` header for a simulated Sanity
// status-change webhook. Format mirrors what Sanity itself sends and
// what backend/src/routes/sanity-webhook.ts expects:
//
//   t=<unix-seconds>,v1=<base64url(HMAC-SHA256(timestamp + '.' + body))>

export function buildSanityWebhookHeader(rawBody: string, secret: string): string {
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const payload = `${timestamp}.${rawBody}`;
	const signature = createHmac('sha256', secret).update(payload).digest('base64url');
	return `t=${timestamp},v1=${signature}`;
}

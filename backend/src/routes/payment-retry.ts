import { Hono, type Context } from 'hono';
import { buildPaymentFormData, type PayFastConfig } from '../payfast.js';
import { createRateLimiter } from '../rate-limit.js';
import { emailsMatch } from '../email-match.js';
import {
	getOrderForRetry,
	incrementRetryAttempt,
	RetryLimitExceededError
} from '../orders-store.js';

// Full design + threat model: docs/payment-retry.md.
//
// Self-service payment retry lets a customer re-submit the SAME orderRef
// to PayFast so the eventual successful ITN updates the original Sanity
// document (instead of leaving a duplicate `pending_payment` row from a
// fresh /orders submission). Every fail path returns 404 with the same
// body so the endpoint can't be used to enumerate valid refs or
// distinguish "wrong email" from "wrong status" — see
// docs/security.md § Risk 3.
//
// Rate limits:
//   - Per-IP fixed window (10 / 15 min) — same shape as POST /orders,
//     double the budget so a customer fat-fingering an email a few
//     times still gets through.
//   - Per-orderRef lifetime cap (5 across the order's life) — enforced
//     atomically on DynamoDB via the ConditionExpression in
//     `incrementRetryAttempt`. Closes the concurrency window.
//
// Deviation from docs/payment-retry.md's step 4 placement:
// the design originally ordered "per-orderRef rate limit" BEFORE
// auth+status+window checks. Implementing that strictly would let a
// distributed-IP attacker who knows a valid orderRef burn the
// customer's 5 retry slots by spraying wrong-email attempts (each
// failed attempt would still increment the counter). The counter is
// therefore placed AFTER the email/status/window guards here, so only
// genuinely-authenticated retries count against the cap. Documented
// in docs/payment-retry.md § Per-orderRef rate limit.

const MAX_RETRIES_PER_ORDER = 5;
const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ORDER_REF_RE = /^MG-\d{6}-[A-Z0-9]{6}$/;

const NOT_FOUND_BODY = { error: 'Order not found' };
const RATE_LIMIT_BODY = { error: 'Too many requests. Please try again later.' };

function getPayFastConfig(): PayFastConfig | null {
	const merchantId = process.env.PAYFAST_MERCHANT_ID;
	const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
	const passphrase = process.env.PAYFAST_PASSPHRASE;
	if (!merchantId || !merchantKey || !passphrase) return null;
	return {
		merchantId,
		merchantKey,
		passphrase,
		sandbox: process.env.PAYFAST_SANDBOX === 'true'
	};
}

function siteUrl(): string {
	return (process.env.SITE_URL ?? 'http://localhost:7777').replace(/\/$/, '');
}

function apiUrl(c: Context): string {
	const override = process.env.API_URL?.trim();
	return (override || new URL(c.req.url).origin).replace(/\/$/, '');
}

export function paymentRetryRouter() {
	const retry = new Hono();

	const retryLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

	retry.post('/:ref/retry-payment', retryLimiter, async (c) => {
		const ref = c.req.param('ref') ?? '';
		const email = c.req.query('email')?.trim().toLowerCase() ?? '';

		// Ref shape. Reject malformed refs before any DB read so the
		// timing of "valid shape, doesn't exist" matches "invalid shape".
		if (!ORDER_REF_RE.test(ref)) {
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Email param presence. Same 404 as auth failures so the caller
		// can't tell "ref is valid, missing email" from "ref is invalid".
		if (!email) {
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Load order via the retry adapter (Phase-agnostic Sanity +
		// DynamoDB join). Returns null when either side is missing OR
		// when the stored amountZar is null — both fail-closed to 404.
		let model: Awaited<ReturnType<typeof getOrderForRetry>>;
		try {
			model = await getOrderForRetry(ref);
		} catch (err) {
			// Stringify err.message rather than passing the raw Error
			// object — matches the convention in orders-store.ts and
			// sanity-webhook.ts so customer values that an SDK happens
			// to embed in a message don't reach CloudWatch.
			const message = err instanceof Error ? err.message : String(err);
			console.error(`retry-payment: store read failed for ${ref}: ${message}`);
			return c.json(NOT_FOUND_BODY, 404);
		}
		if (!model) {
			console.warn(`retry-payment: order ${ref} not found`);
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Constant-time email compare. Canonicalise (trim + lowercase)
		// both sides — the supplied email was canonicalised at parse
		// time above; the stored one is canonicalised here.
		const storedEmail = model.customerEmail.trim().toLowerCase();
		if (!emailsMatch(storedEmail, email)) {
			console.warn(`retry-payment: email mismatch for ${ref}`);
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Status guard. Only orders still waiting for payment are
		// retryable. Already-paid / shipped / cancelled orders return
		// 404 — same body as "wrong email" so the difference isn't
		// observable.
		if (model.status !== 'pending_payment') {
			console.warn(`retry-payment: status guard rejected ${ref} (status=${model.status})`);
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Retry window. Order must have been created within
		// RETRY_WINDOW_MS. NaN math (if `createdAt` were missing)
		// compares false in every direction, which is the fail-closed
		// direction.
		const createdAtMs = Date.parse(model.createdAt);
		const ageMs = Date.now() - createdAtMs;
		if (!Number.isFinite(ageMs) || ageMs >= RETRY_WINDOW_MS) {
			console.warn(`retry-payment: outside 7-day window for ${ref}`);
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Per-orderRef counter. Only authenticated, in-window, still-
		// pending retries count toward the cap — so a wrong-email
		// attacker can't burn the customer's 5 lifetime slots. The
		// atomic DynamoDB ConditionExpression also closes the
		// concurrency window: two simultaneous valid retries both
		// attempt the update, only one passes the condition.
		try {
			await incrementRetryAttempt(ref, MAX_RETRIES_PER_ORDER);
		} catch (err) {
			if (err instanceof RetryLimitExceededError) {
				console.warn(`retry-payment: per-order limit hit for ${ref}`);
				return c.json(RATE_LIMIT_BODY, 429);
			}
			const message = err instanceof Error ? err.message : String(err);
			console.error(`retry-payment: counter increment failed for ${ref}: ${message}`);
			return c.json(NOT_FOUND_BODY, 404);
		}

		// Use stored `amountZar`. Re-deriving from current Sanity
		// product prices would (a) break the ITN amount check if Meryl
		// edited a product between order and retry, and (b) could
		// undercharge if the new price were lower. Trust the
		// server-computed amount from the original POST /orders.
		const pfConfig = getPayFastConfig();
		if (!pfConfig) {
			console.error('retry-payment: PayFast not configured');
			return c.json({ error: 'Payment processing is not configured.' }, 500);
		}

		const site = siteUrl();
		const api = apiUrl(c);

		// Sign a fresh PayFast form with the SAME orderRef. The
		// eventual successful ITN will update the original order
		// document because the ITN handler is keyed on m_payment_id
		// (== orderRef). `customerName` is sourced from the stored
		// PII so the re-signed form matches what the original
		// `POST /orders` form produced — empty-string substitution
		// caused a name_first present-but-empty field to ship to
		// PayFast which could fail signature verification (audit M-3).
		const formData = buildPaymentFormData(pfConfig, {
			orderRef: ref,
			amountZar: model.amountZar,
			itemName: `Meryl Green Designs order ${ref}`,
			customerName: model.customerName,
			customerEmail: storedEmail,
			returnUrl: `${site}/payment/complete?ref=${encodeURIComponent(ref)}`,
			cancelUrl: `${site}/payment/cancelled?ref=${encodeURIComponent(ref)}`,
			notifyUrl: `${api}/webhooks/payfast-itn`
		});

		// Audit log: orderRef + action + result only. No email value,
		// no customer name, no items. Regression-guarded by the same
		// PII-leak test pattern that protects the admin routes (see
		// email.test.ts § admin route logs do not leak PII).
		console.log(`retry-payment: orderRef=${ref} result=ok`);

		return c.json({ success: true, ref, payfast: formData });
	});

	return retry;
}

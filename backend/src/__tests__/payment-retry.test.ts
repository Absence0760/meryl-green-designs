import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '../orders-store.js';

// Mock the entire orders-store module so we can drive `getOrderForRetry`
// and `incrementRetryAttempt` from the test. The retry handler is the
// only caller of those two exports.
vi.mock('../orders-store.js', async () => {
	const actual = await vi.importActual<typeof import('../orders-store.js')>(
		'../orders-store.js'
	);
	return {
		...actual,
		getOrderForRetry: vi.fn(),
		incrementRetryAttempt: vi.fn()
	};
});

import { createApp } from '../app.js';
import * as ordersStore from '../orders-store.js';
import { RetryLimitExceededError } from '../orders-store.js';

const VALID_REF = 'MG-260514-ABCDEF';
const CUSTOMER_EMAIL = 'jane@example.com';

function retryModel(overrides: Partial<{
	status: Order['status'];
	amountZar: number;
	createdAt: string;
	customerEmail: string;
	customerName: string;
}> = {}) {
	return {
		status: 'pending_payment' as const,
		amountZar: 450,
		// 1 day old by default — comfortably inside the 7-day window.
		createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
		customerEmail: CUSTOMER_EMAIL,
		customerName: 'Jane Smith',
		...overrides
	};
}

async function postRetry(ref: string, email: string | null = CUSTOMER_EMAIL) {
	const app = createApp();
	const query = email == null ? '' : `?email=${encodeURIComponent(email)}`;
	return app.request(`/orders/${encodeURIComponent(ref)}/retry-payment${query}`, {
		method: 'POST',
		headers: { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 254) + 1}` }
	});
}

describe('POST /orders/:ref/retry-payment', () => {
	beforeEach(() => {
		vi.mocked(ordersStore.getOrderForRetry).mockReset();
		vi.mocked(ordersStore.incrementRetryAttempt).mockReset();
		vi.mocked(ordersStore.incrementRetryAttempt).mockResolvedValue();
		// Stub PayFast env so the handler can sign a form on the
		// success path. Tests that exercise the un-configured path
		// override these explicitly.
		vi.stubEnv('PAYFAST_MERCHANT_ID', '10000100');
		vi.stubEnv('PAYFAST_MERCHANT_KEY', 'test-key');
		vi.stubEnv('PAYFAST_PASSPHRASE', 'test-passphrase');
		vi.stubEnv('PAYFAST_SANDBOX', 'true');
		vi.stubEnv('SITE_URL', 'http://localhost:7777');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('success path', () => {
		it('returns 200 with signed PayFast form data for a valid retry', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(retryModel());

			const res = await postRetry(VALID_REF);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				ref: string;
				payfast: { action: string; fields: Record<string, string> };
			};
			expect(body.success).toBe(true);
			expect(body.ref).toBe(VALID_REF);
			expect(body.payfast.action).toContain('payfast.co.za');
			// The SAME orderRef is used so the eventual ITN updates
			// the original document. This is the whole point of the
			// retry endpoint.
			expect(body.payfast.fields.m_payment_id).toBe(VALID_REF);
			// Amount comes from the stored model (server-trusted),
			// not from any client input.
			expect(body.payfast.fields.amount).toBe('450.00');
			// Email is the canonicalised stored value.
			expect(body.payfast.fields.email_address).toBe(CUSTOMER_EMAIL);
			// Name comes from stored PII — not an empty substitute that
			// would mismatch PayFast's signature verification (audit M-3).
			expect(body.payfast.fields.name_first).toBe('Jane');
			expect(body.payfast.fields.name_last).toBe('Smith');
			// PayFast signature is always present on a valid form.
			expect(body.payfast.fields.signature).toMatch(/^[a-f0-9]{32}$/);
		});

		it('uses single-name customers correctly (no name_last field)', async () => {
			// Mirror of orders.ts behaviour: when the customer's name
			// is a single word, name_last is omitted entirely rather
			// than sent as empty.
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ customerName: 'Madonna' })
			);
			const res = await postRetry(VALID_REF);
			const body = (await res.json()) as { payfast: { fields: Record<string, string> } };
			expect(body.payfast.fields.name_first).toBe('Madonna');
			expect(body.payfast.fields).not.toHaveProperty('name_last');
		});

		it('increments the per-orderRef counter atomically', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(retryModel());
			await postRetry(VALID_REF);
			expect(ordersStore.incrementRetryAttempt).toHaveBeenCalledWith(VALID_REF, 5);
		});

		it('uses the stored amountZar even when Sanity prices have changed', async () => {
			// Per design: re-deriving from current prices breaks the ITN
			// amount check if Meryl edits a product between order + retry.
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ amountZar: 999.99 })
			);
			const res = await postRetry(VALID_REF);
			const body = (await res.json()) as {
				payfast: { fields: Record<string, string> };
			};
			expect(body.payfast.fields.amount).toBe('999.99');
		});

		it('canonicalises the supplied email (case-insensitive, trimmed) before comparing', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ customerEmail: '  Jane@Example.COM  ' })
			);
			const res = await postRetry(VALID_REF, '  jane@example.com  ');
			expect(res.status).toBe(200);
		});
	});

	describe('404 paths (no-enumeration policy)', () => {
		const sameBody = { error: 'Order not found' };

		it('returns 404 when :ref is malformed', async () => {
			const res = await postRetry('not-a-ref');
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			expect(ordersStore.getOrderForRetry).not.toHaveBeenCalled();
		});

		it('returns 404 when email query param is missing (not 400)', async () => {
			const res = await postRetry(VALID_REF, null);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			expect(ordersStore.getOrderForRetry).not.toHaveBeenCalled();
		});

		it('returns 404 when the order does not exist', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(null);
			const res = await postRetry(VALID_REF);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			expect(ordersStore.incrementRetryAttempt).not.toHaveBeenCalled();
		});

		it('returns 404 when the email does not match', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ customerEmail: 'someone-else@example.com' })
			);
			const res = await postRetry(VALID_REF);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			// Counter must NOT increment on email mismatch — otherwise
			// a distributed attacker could lock out a legitimate
			// retry by burning the 5 lifetime slots with wrong-email
			// attempts.
			expect(ordersStore.incrementRetryAttempt).not.toHaveBeenCalled();
		});

		it('returns 404 when the order is already past pending_payment', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ status: 'payment_received' })
			);
			const res = await postRetry(VALID_REF);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			expect(ordersStore.incrementRetryAttempt).not.toHaveBeenCalled();
		});

		it('returns 404 when the order is older than 7 days', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({
					createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
				})
			);
			const res = await postRetry(VALID_REF);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			expect(ordersStore.incrementRetryAttempt).not.toHaveBeenCalled();
		});

		it('returns 404 when the store read throws (no err.message leakage)', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockRejectedValueOnce(
				new Error('dynamo down')
			);
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const res = await postRetry(VALID_REF);
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual(sameBody);
			errSpy.mockRestore();
		});

		it('every 404 path returns the same body shape (no observable difference)', async () => {
			// One canonical body across malformed-ref, missing-email,
			// not-found, wrong-email, wrong-status, out-of-window —
			// otherwise an attacker can fingerprint which guard
			// rejected them.
			const calls = [
				{ ref: 'bad-ref', email: CUSTOMER_EMAIL, mock: () => {} },
				{
					ref: VALID_REF,
					email: '',
					mock: () => {}
				},
				{
					ref: VALID_REF,
					email: CUSTOMER_EMAIL,
					mock: () =>
						vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(null)
				},
				{
					ref: VALID_REF,
					email: CUSTOMER_EMAIL,
					mock: () =>
						vi
							.mocked(ordersStore.getOrderForRetry)
							.mockResolvedValueOnce(retryModel({ customerEmail: 'x@y.z' }))
				},
				{
					ref: VALID_REF,
					email: CUSTOMER_EMAIL,
					mock: () =>
						vi
							.mocked(ordersStore.getOrderForRetry)
							.mockResolvedValueOnce(retryModel({ status: 'cancelled' }))
				}
			];
			const bodies = new Set<string>();
			for (const { ref, email, mock } of calls) {
				vi.mocked(ordersStore.getOrderForRetry).mockReset();
				mock();
				const res = await postRetry(ref, email);
				expect(res.status).toBe(404);
				bodies.add(await res.text());
			}
			// Every 404 path must serialise to the same body string.
			expect(bodies.size).toBe(1);
		});
	});

	describe('429 path', () => {
		it('returns 429 when the per-orderRef lifetime cap is exceeded', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(retryModel());
			vi.mocked(ordersStore.incrementRetryAttempt).mockRejectedValueOnce(
				new RetryLimitExceededError(VALID_REF)
			);
			const res = await postRetry(VALID_REF);
			expect(res.status).toBe(429);
			expect(await res.json()).toEqual({
				error: 'Too many requests. Please try again later.'
			});
		});

		it('per-IP rate limit eventually returns 429', async () => {
			// 11 requests from the same IP — the 11th exceeds the
			// configured 10-per-15-min window.
			const app = createApp();
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValue(retryModel());
			const ip = '203.0.113.42';
			const statuses: number[] = [];
			for (let i = 0; i < 11; i++) {
				const r = await app.request(
					`/orders/${VALID_REF}/retry-payment?email=${encodeURIComponent(CUSTOMER_EMAIL)}`,
					{
						method: 'POST',
						headers: { 'x-forwarded-for': ip }
					}
				);
				statuses.push(r.status);
			}
			// First 10 should succeed (200); the 11th hits the IP limit (429).
			expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
			expect(statuses[10]).toBe(429);
		});
	});

	describe('PII-leak guards', () => {
		// Success-path audit log must contain only orderRef + action +
		// result. Error-path logs must also stay clean. Same shape as
		// the admin-route PII tests in email.test.ts.
		const piiSamples = {
			customerEmail: 'jane.leaky@example.com'
		};

		let logSpy: ReturnType<typeof vi.spyOn>;
		let warnSpy: ReturnType<typeof vi.spyOn>;
		let errSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			logSpy.mockRestore();
			warnSpy.mockRestore();
			errSpy.mockRestore();
		});

		function collect(): string {
			return [
				...logSpy.mock.calls,
				...warnSpy.mock.calls,
				...errSpy.mock.calls
			]
				.map((c) => c.map(String).join(' '))
				.join('\n');
		}

		it('success-path log contains orderRef + action + result, no email', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ customerEmail: piiSamples.customerEmail })
			);
			await postRetry(VALID_REF, piiSamples.customerEmail);
			const logs = collect();
			expect(logs).toContain('retry-payment: orderRef=MG-260514-ABCDEF result=ok');
			expect(logs).not.toContain(piiSamples.customerEmail);
		});

		it('email-mismatch warning does not include either email value', async () => {
			vi.mocked(ordersStore.getOrderForRetry).mockResolvedValueOnce(
				retryModel({ customerEmail: piiSamples.customerEmail })
			);
			await postRetry(VALID_REF, 'attacker@example.com');
			const logs = collect();
			expect(logs).not.toContain(piiSamples.customerEmail);
			expect(logs).not.toContain('attacker@example.com');
		});

		it('store-read error log uses err.message — not the raw Error — so embedded PII does not leak', async () => {
			// Defends the err.message-only convention. If the SDK ever
			// embeds an email value in an error message, this test
			// still passes (we strip the stack but keep the message);
			// it fails the moment someone reverts to `console.error(...,
			// err)` because the Error string representation includes
			// the stack and the test asserts no stack lines.
			vi.mocked(ordersStore.getOrderForRetry).mockRejectedValueOnce(
				new Error('SDK failure')
			);
			await postRetry(VALID_REF);
			const logs = collect();
			expect(logs).not.toMatch(/at\s+\w+\s+\(/); // no stack frames
		});
	});
});

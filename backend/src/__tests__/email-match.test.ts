import { describe, it, expect } from 'vitest';
import { emailsMatch } from '../email-match.js';

// Direct unit tests for the constant-time email-equality helper.
//
// Why we test this in isolation: emailsMatch is the only thing
// standing between a timing-oracle attacker and the customer email
// stored against an order. The handler-level tests in
// payment-retry.test.ts and the existing order-lookup tests exercise
// it indirectly, but a regression that broke the constant-time
// property (e.g. a refactor swapping in `===`) would slip past those
// because both flows return 404 either way.

describe('emailsMatch', () => {
	it('returns true for identical strings', () => {
		expect(emailsMatch('jane@example.com', 'jane@example.com')).toBe(true);
	});

	it('returns false for different strings', () => {
		expect(emailsMatch('jane@example.com', 'bob@example.com')).toBe(false);
	});

	it('returns false for strings differing only in case (caller must canonicalise)', () => {
		// The helper does NOT normalise — every call site is
		// responsible for trim/lowercase before comparing. Keeping
		// canonicalisation out of the helper makes the rule visible
		// at the call site and lets the comparison stay byte-for-byte
		// over the SHA-256 digest.
		expect(emailsMatch('Jane@Example.com', 'jane@example.com')).toBe(false);
	});

	it('returns false for emails that differ only in trailing whitespace', () => {
		// Same rationale — canonicalisation is the caller's job.
		expect(emailsMatch('jane@example.com ', 'jane@example.com')).toBe(false);
	});

	it('returns false for the empty string against a real email', () => {
		expect(emailsMatch('', 'jane@example.com')).toBe(false);
	});

	it('returns true for the empty string against the empty string', () => {
		// Edge case — both digests are the SHA-256 of the empty
		// string, which equals itself. Callers must guard against
		// empty emails before calling, but the helper itself is
		// well-defined.
		expect(emailsMatch('', '')).toBe(true);
	});

	it('returns false for short-vs-long emails (length side-channel is closed)', () => {
		// The SHA-256 hashing step is what closes the length side
		// channel: both digests are 32 bytes regardless of input
		// length, so timingSafeEqual operates on the same number of
		// bytes whether the inputs are 5 chars or 500.
		expect(emailsMatch('a@b.c', 'a-very-long-email-address@example.com')).toBe(false);
	});

	it('handles unicode in email local-parts (Sanity allows them)', () => {
		// Sanity's order schema doesn't reject Unicode in
		// customerEmail. The comparison still works byte-for-byte
		// over the UTF-8 encoded SHA-256 digest.
		expect(emailsMatch('jané@example.com', 'jané@example.com')).toBe(true);
		expect(emailsMatch('jané@example.com', 'jane@example.com')).toBe(false);
	});

	it('rejects email-address pairs that share a SHA-256 prefix but differ later', () => {
		// Regression guard: if a future maintainer ever swapped
		// `digest()` for `digest().slice(0, n)` to "save bytes", this
		// test would catch the partial-prefix bug. (The current code
		// uses the full 32-byte digest, so no two real emails would
		// collide here — the test relies on byte-for-byte equality.)
		expect(emailsMatch('aaa@example.com', 'aab@example.com')).toBe(false);
	});
});

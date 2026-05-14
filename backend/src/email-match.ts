import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time email equality.
 *
 * Plain `===` short-circuits at the first differing byte, leaking the
 * stored email one character at a time via response-timing measurements.
 * Hashing both sides with SHA-256 first means `timingSafeEqual` operates
 * on fixed-length 32-byte digests — that also closes the length-based
 * side channel that would remain if we compared raw email buffers (real
 * emails vary in length; a token-style length-then-compare check would
 * leak the email length).
 *
 * Callers should canonicalise (trim + lowercase) both sides before
 * comparing; the helper itself doesn't normalise so the rule is visible
 * at the call site.
 */
export function emailsMatch(a: string, b: string): boolean {
	const aDigest = createHash('sha256').update(a).digest();
	const bDigest = createHash('sha256').update(b).digest();
	return timingSafeEqual(aDigest, bDigest);
}

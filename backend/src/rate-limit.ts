import type { Context, MiddlewareHandler } from 'hono';

type Bucket = { count: number; resetAt: number };

/**
 * In-memory fixed-window rate limiter. Buckets live in the closure of each
 * limiter instance, so different routes have independent counters and
 * different app instances (e.g. in tests) start fresh.
 *
 * In Lambda, buckets persist within a warm instance and reset on cold start.
 * Concurrent invocations get independent buckets — meaning the effective
 * global limit is `max × concurrent_instances`. Adequate as a defence
 * against single-IP flooding; for distributed-attacker mitigation, use a
 * shared store (DynamoDB, Redis) or AWS WAF in front.
 */
export function createRateLimiter(opts: {
	windowMs: number;
	max: number;
	/** Override IP extraction — defaults to {@link getClientIp}. */
	keyFn?: (c: Context) => string;
}): MiddlewareHandler {
	const buckets = new Map<string, Bucket>();
	let cleanupCounter = 0;
	const CLEANUP_EVERY = 100;

	return async (c, next) => {
		const key = opts.keyFn ? opts.keyFn(c) : getClientIp(c);
		const now = Date.now();

		// Opportunistic cleanup of expired buckets so the Map doesn't grow
		// unbounded on a long-lived warm Lambda.
		if (++cleanupCounter % CLEANUP_EVERY === 0) {
			for (const [k, v] of buckets) {
				if (now >= v.resetAt) buckets.delete(k);
			}
		}

		const bucket = buckets.get(key);
		if (!bucket || now >= bucket.resetAt) {
			buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
			return next();
		}

		if (bucket.count >= opts.max) {
			const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
			c.header('Retry-After', String(retryAfter));
			return c.json({ error: 'Too many requests. Please try again later.' }, 429);
		}

		bucket.count++;
		return next();
	};
}

/**
 * AWS Lambda Function URLs populate `x-forwarded-for` with the originating
 * client IP (first entry) followed by any intermediaries. Local dev via
 * `@hono/node-server` may or may not set it depending on the proxy chain.
 *
 * Falls back to a single bucket-key when no IP can be determined, which is
 * conservative: anonymous traffic shares one quota rather than bypassing
 * the limit entirely.
 */
export function getClientIp(c: Context): string {
	const xff = c.req.header('x-forwarded-for');
	if (xff) {
		const first = xff.split(',')[0]?.trim();
		if (first) return first;
	}
	return c.req.header('x-real-ip') ?? 'unknown';
}

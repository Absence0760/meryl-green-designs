import { findOrdersWithExpiredPii, clearOrderPii } from './sanity.js';

/**
 * 12 months. POPIA Section 14 says retention must be tied to a documented
 * purpose — this is the documented purpose window for fulfilment, returns,
 * and dispute resolution. After 12 months in a terminal state, customer
 * PII is no longer needed.
 *
 * Override via the `RETENTION_DAYS` env var if the legal posture changes.
 */
const DEFAULT_RETENTION_DAYS = 365;

export type CleanupSummary = {
	cutoffIso: string;
	scanned: number;
	cleared: number;
	failed: Array<{ orderRef: string; error: string }>;
};

/**
 * Find every order in a terminal state (`delivered` or `cancelled`) whose
 * last update is older than the retention window, and null out its PII
 * fields. Idempotent — a re-run with no new eligible orders returns
 * `cleared: 0`.
 *
 * On individual patch failures the function continues and reports the
 * failures in the summary. The overall return value is always defined;
 * the caller decides how to react to non-empty `failed`.
 */
export async function runPiiCleanup(opts?: {
	now?: Date;
	retentionDays?: number;
}): Promise<CleanupSummary> {
	const now = opts?.now ?? new Date();
	const envOverride = Number(process.env.RETENTION_DAYS);
	const retentionDays =
		opts?.retentionDays ?? (Number.isFinite(envOverride) && envOverride > 0
			? envOverride
			: DEFAULT_RETENTION_DAYS);

	const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
	const cutoffIso = cutoff.toISOString();

	const eligible = await findOrdersWithExpiredPii(cutoffIso);
	const summary: CleanupSummary = {
		cutoffIso,
		scanned: eligible.length,
		cleared: 0,
		failed: []
	};

	for (const order of eligible) {
		try {
			await clearOrderPii(order._id);
			summary.cleared++;
		} catch (err) {
			summary.failed.push({
				orderRef: order.orderRef,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}

	console.log(
		`[pii-cleanup] cutoff=${cutoffIso} scanned=${summary.scanned} ` +
			`cleared=${summary.cleared} failed=${summary.failed.length}`
	);
	if (summary.failed.length > 0) {
		console.warn('[pii-cleanup] failures', summary.failed);
	}
	return summary;
}

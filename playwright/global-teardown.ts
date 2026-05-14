// Per-run teardown. Currently a no-op — the next run's globalSetup
// wipes Sanity, and the DynamoDB rows expire via TTL (or via
// `pnpm dev:db:reset` if the operator wants a clean local slate).
//
// Kept as a file so adding cleanup later (e.g. closing a shared
// fixtures channel, emitting a JSON summary) is a localised change
// rather than a config edit.
export default async function globalTeardown(): Promise<void> {
	// intentionally empty
}

// Defence-in-depth helper for rendering operator-supplied URLs into
// `href={…}` attributes. Returns the original string only if it parses
// as a plain http:// or https:// URL; returns null otherwise.
//
// The backend already rejects non-http(s) values at the admin PATCH
// endpoint (see backend/src/routes/admin.ts: isSafeHttpUrl). This
// helper exists so a stale value already stored in DynamoDB — or a
// hostile value that somehow bypassed the upstream guard — can't
// reach the DOM as a `javascript:` anchor.
//
// Used by `/track` for `trackingUrl`. Reuse anywhere else that
// renders a stored URL into an anchor.

export function safeHttpUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return null;
	}
	return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value : null;
}

// Serialise structured data for a `<script type="application/ld+json">`
// tag rendered via `{@html}`. `<`, `>` and `&` are written as JSON
// unicode escapes (still valid JSON, identical once parsed) so a CMS
// string containing `</script>` or `<!--` can never terminate the tag
// or open an HTML comment. U+2028/U+2029 are escaped too — legal in
// JSON, but some older script parsers treat them as line breaks.
export function serializeJsonLd(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/** A complete `<script type="application/ld+json">` element, safe for `{@html}`. */
export function jsonLdScript(data: unknown): string {
	return `<script type="application/ld+json">${serializeJsonLd(data)}</script>`;
}

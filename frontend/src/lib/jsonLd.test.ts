import { describe, expect, it } from 'vitest';
import { jsonLdScript, serializeJsonLd } from './jsonLd';

describe('serializeJsonLd', () => {
	it('round-trips to the same data', () => {
		const data = { '@type': 'Thing', name: 'A & B <c> "d"', n: 3, list: [1, 'x'] };
		expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
	});

	it('never emits a raw `<`, `>` or `&`', () => {
		const out = serializeJsonLd({ name: '</script><script>alert(1)</script> <!-- & -->' });
		expect(out).not.toMatch(/[<>&]/);
		expect(out).toContain('\\u003c/script\\u003e');
	});

	it('escapes the JSON-legal line/paragraph separators', () => {
		const out = serializeJsonLd({ s: 'a\u2028b\u2029c' });
		expect(out).not.toMatch(/[\u2028\u2029]/);
		expect(JSON.parse(out)).toEqual({ s: 'a\u2028b\u2029c' });
	});
});

describe('jsonLdScript', () => {
	it('wraps the payload in exactly one ld+json script element', () => {
		const html = jsonLdScript({ name: '</script>' });
		expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
		expect(html.endsWith('</script>')).toBe(true);
		expect(html.match(/<\/script>/g)).toHaveLength(1);
	});
});

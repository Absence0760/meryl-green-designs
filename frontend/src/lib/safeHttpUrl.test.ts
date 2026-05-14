import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from './safeHttpUrl';

describe('safeHttpUrl', () => {
	it.each([
		'https://example.com/track/X',
		'http://example.com/track/X',
		'https://www.courierguy.co.za/track/CG-12345?ref=abc',
		'https://example.com:8080/path#frag'
	])('accepts http(s) URL: %s', (url) => {
		expect(safeHttpUrl(url)).toBe(url);
	});

	it.each([
		['javascript:alert(1)'],
		['JavaScript:alert(1)'],
		['data:text/html,<script>alert(1)</script>'],
		['vbscript:msgbox(1)'],
		['file:///etc/passwd'],
		['ftp://example.com/file'],
		['not a url at all'],
		['/relative/path'],
		['//protocol-relative.example.com']
	])('rejects non-http(s) URL: %s', (url) => {
		expect(safeHttpUrl(url)).toBeNull();
	});

	it.each([null, undefined, ''])('treats %s as no link', (value) => {
		expect(safeHttpUrl(value)).toBeNull();
	});
});

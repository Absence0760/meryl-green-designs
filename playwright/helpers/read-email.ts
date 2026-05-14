import { readdir, readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Drive the backend's file-backend email capture. With EMAIL_BACKEND=file
// the backend writes every sendEmail() call to backend/.dev-emails/ as a
// self-contained HTML file with the recipient, subject, and reply-to
// in HTML comments at the top.
//
// These helpers are used by specs to assert "an order email arrived for
// X" without depending on Resend.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMAILS_DIR = path.resolve(__dirname, '..', '..', 'backend', '.dev-emails');

export type CapturedEmail = {
	filePath: string;
	timestamp: string;
	to: string;
	subject: string;
	replyTo: string | null;
	bodyHtml: string;
};

// The backend's file-backend emits a single multi-line HTML comment at
// the top with `to:` / `from:` / `subject:` / `replyTo:` keys (lowercase,
// indented). Match each field on its own line inside that comment.
const RE_TO = /^\s*to:\s*(.+?)\s*$/im;
const RE_SUBJECT = /^\s*subject:\s*(.+?)\s*$/im;
const RE_REPLY_TO = /^\s*replyTo:\s*(.+?)\s*$/im;

async function listEmailFiles(): Promise<string[]> {
	try {
		const entries = await readdir(EMAILS_DIR);
		return entries
			.filter((f) => f.endsWith('.html'))
			.sort() // filename starts with ISO timestamp; lexical sort = chronological
			.map((f) => path.join(EMAILS_DIR, f));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
}

async function parseFile(filePath: string): Promise<CapturedEmail> {
	const bodyHtml = await readFile(filePath, 'utf8');
	const to = RE_TO.exec(bodyHtml)?.[1] ?? '';
	const subject = RE_SUBJECT.exec(bodyHtml)?.[1] ?? '';
	const replyTo = RE_REPLY_TO.exec(bodyHtml)?.[1] ?? null;
	const filename = path.basename(filePath);
	const timestamp = filename.split('-').slice(0, 3).join('-'); // approx ISO date
	return { filePath, timestamp, to, subject, replyTo, bodyHtml };
}

/** Wipe the capture dir so specs start from a clean slate. */
export async function clearCapturedEmails(): Promise<void> {
	try {
		await rm(EMAILS_DIR, { recursive: true, force: true });
	} catch {
		// directory may not exist yet — fine
	}
	await mkdir(EMAILS_DIR, { recursive: true });
}

/** List every captured email in chronological order. */
export async function listCapturedEmails(): Promise<CapturedEmail[]> {
	const files = await listEmailFiles();
	return Promise.all(files.map(parseFile));
}

/**
 * Wait until at least `count` emails matching `predicate` have been captured,
 * or fail after `timeoutMs`. Polls every 200 ms.
 */
export async function waitForEmail(
	predicate: (email: CapturedEmail) => boolean,
	opts: { count?: number; timeoutMs?: number } = {},
): Promise<CapturedEmail[]> {
	const want = opts.count ?? 1;
	const deadline = Date.now() + (opts.timeoutMs ?? 5000);
	while (Date.now() < deadline) {
		const all = await listCapturedEmails();
		const matches = all.filter(predicate);
		if (matches.length >= want) return matches;
		await new Promise((r) => setTimeout(r, 200));
	}
	const all = await listCapturedEmails();
	throw new Error(
		`waitForEmail: matched ${all.filter(predicate).length} of ${want} required emails ` +
			`within ${opts.timeoutMs ?? 5000} ms. Captured so far:\n` +
			all.map((e) => `  - to=${e.to} subject=${e.subject}`).join('\n'),
	);
}

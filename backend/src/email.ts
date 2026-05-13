import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

type SendEmailParams = {
	to: string;
	subject: string;
	html: string;
	replyTo?: string;
};

export async function sendEmail(params: SendEmailParams): Promise<void> {
	if ((process.env.EMAIL_BACKEND ?? 'resend').toLowerCase() === 'file') {
		await sendViaFile(params);
		return;
	}
	await sendViaResend(params);
}

async function sendViaResend(params: SendEmailParams): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.FROM_EMAIL;
	if (!apiKey || !from) {
		throw new Error('Email service is not configured (RESEND_API_KEY / FROM_EMAIL missing).');
	}

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from,
			to: params.to,
			subject: params.subject,
			html: params.html,
			...(params.replyTo ? { reply_to: params.replyTo } : {})
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Resend API error (${res.status}): ${body}`);
	}
}

// Local-dev capture backend. Writes the rendered email to disk so it
// can be previewed in a browser without sending anything. Activated by
// setting EMAIL_BACKEND=file in backend/.env. Strictly dev-only; not
// reachable from the deployed Lambda (the env var stays unset there).
async function sendViaFile(params: SendEmailParams): Promise<void> {
	const dir = resolveDevDir();
	await mkdir(dir, { recursive: true });

	const now = new Date();
	const ts = now.toISOString().replace(/[:.]/g, '-');
	const slug =
		params.subject
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 60) || 'email';
	const file = join(dir, `${ts}-${slug}.html`);

	const meta = [
		'<!--',
		`  to: ${params.to}`,
		`  from: ${process.env.FROM_EMAIL ?? '(unset)'}`,
		`  subject: ${params.subject}`,
		`  replyTo: ${params.replyTo ?? '(none)'}`,
		`  capturedAt: ${now.toISOString()}`,
		'-->',
		''
	].join('\n');

	await writeFile(file, meta + params.html);
	console.log(`[email:file] ${params.to} <- ${params.subject} -> file://${file}`);
}

// Confines the file backend to either the current working directory
// (the project tree in normal dev) or the OS tmp dir (used by tests).
// `EMAIL_DEV_DIR` is read from the env, but a malformed value should
// not let us silently write to e.g. `$HOME` or `/etc`.
function resolveDevDir(): string {
	const dir = resolve(process.env.EMAIL_DEV_DIR ?? '.dev-emails');
	const allowedRoots = [resolve(process.cwd()), resolve(tmpdir())];
	if (!allowedRoots.some((root) => dir === root || dir.startsWith(root + '/'))) {
		throw new Error(
			`EMAIL_DEV_DIR must be under the project working directory or the OS tmp dir, got: ${dir}`
		);
	}
	return dir;
}

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

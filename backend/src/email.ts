type SendEmailParams = {
	to: string;
	subject: string;
	html: string;
	replyTo?: string;
};

export async function sendEmail(params: SendEmailParams): Promise<void> {
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

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

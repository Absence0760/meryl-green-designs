<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { page } from '$app/state';
	import Button from '$lib/Button.svelte';

	const apiUrl = PUBLIC_API_URL;

	let name = '';
	let email = '';
	let phone = '';
	let photoReference = '';
	let size = '';
	let finish = '';
	let location = '';
	let message = '';
	// Honeypot — bots fill every input; humans never see it.
	let website = '';

	type SubmitState = 'idle' | 'sending' | 'sent' | 'error';
	let state: SubmitState = 'idle';
	let errorMessage = '';

	onMount(() => {
		// /contact?photo=<caption> pre-fills the photo reference field when
		// the visitor arrived from the gallery via a per-photo CTA.
		const photo = page.url.searchParams.get('photo');
		if (photo) {
			photoReference = photo;
		}
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (state === 'sending') return;
		state = 'sending';
		errorMessage = '';

		try {
			const res = await fetch(`${apiUrl}/enquiries`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					email,
					phone,
					photoReference,
					size,
					finish,
					location,
					message,
					website
				})
			});
			const data = (await res.json().catch(() => ({}))) as {
				success?: boolean;
				error?: string;
			};
			if (!res.ok || !data.success) {
				state = 'error';
				errorMessage =
					data.error ?? "Something went wrong sending your enquiry. Please try again.";
				return;
			}
			state = 'sent';
			name = '';
			email = '';
			phone = '';
			photoReference = '';
			size = '';
			finish = '';
			location = '';
			message = '';
		} catch {
			state = 'error';
			errorMessage =
				"Couldn't reach the server. Please check your connection and try again.";
		}
	}
</script>

<svelte:head>
	<title>Contact — Meryl Green Designs</title>
	<meta
		name="description"
		content="Get in touch with Meryl Green Designs for enquiries, commissions, or orders."
	/>
	<meta property="og:title" content="Contact — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Get in touch with Meryl Green Designs for enquiries, commissions, or orders."
	/>
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Contact</p>
		<h1>Get in touch</h1>
		<p class="lede">
			Whether you're ordering a finished piece, commissioning something bespoke,
			or just asking a question — Meryl would love to hear from you.
		</p>

		<dl class="contact-list">
			<div class="contact-row">
				<dt>Email</dt>
				<dd>
					<a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>
				</dd>
			</div>

			<!-- Phone row removed — Meryl has not provided a public number.
			     Tracked in docs/roadmap.md. Add the row back here once a
			     number is available. -->

			<div class="contact-row">
				<dt>Studio</dt>
				<dd>Based in the Western Cape, South Africa. Shipped nationwide.</dd>
			</div>

			<div class="contact-row">
				<dt>Response</dt>
				<dd>Expect a reply within two business days.</dd>
			</div>
		</dl>

		<article class="contact-block">
			<h2>Commission a piece</h2>
			<p>
				Each photograph in the <a href="/gallery">gallery</a> is an example of
				a style that can be commissioned in custom sizes, woods and finishes.
				Fill in as much as you know and we'll come back with a quote — fields
				marked optional can be left blank if you're still deciding.
			</p>

			{#if state === 'sent'}
				<div class="alert alert--success">
					<p><strong>Thanks — your enquiry is on its way.</strong></p>
					<p>
						Meryl will be in touch within two business days. If it's
						urgent, email <a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>
						directly.
					</p>
				</div>
			{:else}
				<form class="enquiry-form" on:submit={handleSubmit} novalidate>
					{#if state === 'error'}
						<div class="alert alert--error" role="alert">{errorMessage}</div>
					{/if}

					<label>
						<span>Your name <span class="required" aria-hidden="true">*</span></span>
						<input
							type="text"
							name="name"
							required
							autocomplete="name"
							maxlength="120"
							bind:value={name}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Email <span class="required" aria-hidden="true">*</span></span>
						<input
							type="email"
							name="email"
							required
							autocomplete="email"
							maxlength="200"
							bind:value={email}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Phone <span class="optional">(optional)</span></span>
						<input
							type="tel"
							name="phone"
							autocomplete="tel"
							maxlength="40"
							bind:value={phone}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Which photograph caught your eye? <span class="optional">(optional)</span></span>
						<input
							type="text"
							name="photoReference"
							maxlength="200"
							placeholder="e.g. Sunbird screen — sand finish"
							bind:value={photoReference}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Approximate size <span class="optional">(optional)</span></span>
						<input
							type="text"
							name="size"
							maxlength="200"
							placeholder="e.g. 1.5m × 1.8m, 3 panels"
							bind:value={size}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Wood or finish <span class="optional">(optional)</span></span>
						<input
							type="text"
							name="finish"
							maxlength="200"
							placeholder="e.g. Meranti, light wax"
							bind:value={finish}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Where will it go? <span class="optional">(optional)</span></span>
						<input
							type="text"
							name="location"
							maxlength="200"
							placeholder="e.g. living room divider, garden screen"
							bind:value={location}
							disabled={state === 'sending'}
						/>
					</label>

					<label>
						<span>Tell us a little about what you have in mind <span class="required" aria-hidden="true">*</span></span>
						<textarea
							name="message"
							required
							rows="5"
							maxlength="4000"
							bind:value={message}
							disabled={state === 'sending'}
						></textarea>
					</label>

					<!-- Honeypot — visually hidden, hidden from assistive tech. -->
					<label class="honeypot" aria-hidden="true" tabindex="-1">
						Website
						<input
							type="text"
							name="website"
							tabindex="-1"
							autocomplete="off"
							bind:value={website}
						/>
					</label>

					<div class="form-actions">
						<Button type="submit" variant="primary" disabled={state === 'sending'}>
							{state === 'sending' ? 'Sending…' : 'Send enquiry'}
						</Button>
					</div>
				</form>
			{/if}
		</article>

		<article class="contact-block">
			<h2>Existing orders</h2>
			<p>
				Already placed an order? You can check its status any time on the
				<a href="/track">track-order page</a> using your reference and email.
			</p>
		</article>
	</div>
</section>

<style>
	.narrow {
		max-width: 680px;
	}

	.lede {
		font-size: 1.1rem;
		color: var(--color-ink);
		margin-bottom: var(--space-4);
	}

	.muted {
		color: var(--color-ink-soft);
		font-style: italic;
	}

	.contact-list {
		display: grid;
		gap: var(--space-2);
		margin: 0 0 var(--space-5);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--color-rule);
		border-bottom: 1px solid var(--color-rule);
	}

	.contact-row {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: var(--space-2);
		align-items: baseline;
	}

	.contact-list dt {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-bark);
	}

	.contact-list dd {
		margin: 0;
		color: var(--color-ink);
	}

	@media (max-width: 520px) {
		.contact-row {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	.contact-block {
		margin-bottom: var(--space-5);
	}

	.contact-block:last-child {
		margin-bottom: 0;
	}

	.contact-block h2 {
		font-size: 1.3rem;
		margin: 0 0 var(--space-1);
	}

	.contact-block p {
		margin: 0 0 var(--space-3);
		line-height: 1.7;
	}

	.enquiry-form {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.enquiry-form label {
		display: grid;
		gap: 0.35rem;
	}

	.enquiry-form label > span {
		font-size: 0.85rem;
		color: var(--color-ink-soft);
	}

	.required {
		color: var(--color-bark);
	}

	.optional {
		font-style: italic;
	}

	.enquiry-form input,
	.enquiry-form textarea {
		font: inherit;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-rule);
		background: var(--color-surface);
		border-radius: 3px;
		color: var(--color-ink);
	}

	.enquiry-form input:focus,
	.enquiry-form textarea:focus {
		outline: 2px solid var(--color-bark);
		outline-offset: 1px;
	}

	.enquiry-form textarea {
		resize: vertical;
		min-height: 7rem;
		line-height: 1.5;
	}

	.enquiry-form input:disabled,
	.enquiry-form textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.honeypot {
		position: absolute;
		left: -10000px;
		top: auto;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}

	.form-actions {
		margin-top: var(--space-2);
	}

	.alert {
		padding: var(--space-2) var(--space-3);
		border-radius: 4px;
		margin-bottom: var(--space-2);
	}

	.alert p {
		margin: 0 0 0.5rem;
	}

	.alert p:last-child {
		margin-bottom: 0;
	}

	.alert--success {
		background: #e7efde;
		border: 1px solid #a8c19a;
		color: #2f4a25;
	}

	.alert--error {
		background: #fbeaea;
		border: 1px solid #e0a4a4;
		color: #842525;
	}
</style>

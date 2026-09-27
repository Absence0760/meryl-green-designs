<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import Button from '$lib/Button.svelte';
	import { imageUrl, type Product } from '$lib/sanity';
	import { heroSrc } from '$lib/heroImage';
	import {
		INTEREST_OPTIONS,
		enquiryChoiceFields,
		fieldCopy,
		pickContactPhoto,
		productEnquiryPrefill,
		type EnquiryInterest
	} from '$lib/enquiryForm';

	const apiUrl = PUBLIC_API_URL;

	// /contact?product=<slug> comes from a product page's "Ask about this
	// piece" link. Once /products lands it pre-fills the interest and photo
	// reference (only fields still empty, and only once).
	let products: Product[] = [];
	let askedSlug = '';
	let prefilled = false;
	$: asked = productEnquiryPrefill(products, askedSlug);

	// Desktop-only image column beside the form: the asked-about product's
	// photo, else the first product photo once /products lands, the hero
	// photograph until then (or if the fetch fails / returns nothing usable).
	$: picked = pickContactPhoto(products, asked?.product ?? null);
	$: pickedSrc = picked ? imageUrl(picked.photo, 900) : null;
	$: asideSrc = pickedSrc || heroSrc(1280, base);
	$: asideAlt =
		picked && pickedSrc
			? (picked.photo.alt ?? picked.product.name)
			: 'Two flat-topped acacia trees in golden bushveld grass';
	$: asideCaption = picked && pickedSrc ? picked.product.name : '';

	let interest: EnquiryInterest | '' = '';
	$: copy = fieldCopy(interest);

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

	// Pre-fill from ?product= (see `asked` above).
	$: if (asked && !prefilled) {
		prefilled = true;
		if (!interest) interest = asked.interest;
		if (!photoReference) photoReference = asked.photoReference;
	}

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
		askedSlug = page.url.searchParams.get('product') ?? '';

		// Silent no-op on failure, like the home page — the static hero
		// image already fills the column.
		fetch(`${apiUrl}/products`)
			.then((res) => (res.ok ? res.json() : null))
			.then((body: { products?: Product[] } | null) => {
				if (body?.products) products = body.products;
			})
			.catch(() => {
				/* ignore */
			});
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
					...enquiryChoiceFields(interest, finish),
					name,
					email,
					phone,
					photoReference,
					size,
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
			interest = '';
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
	<div class="container contact-layout">
	<div class="contact-main">
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

			<div class="contact-row">
				<dt>Phone</dt>
				<dd><a href="tel:+27823264555">082 326 4555</a></dd>
			</div>

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

					<fieldset class="interest" disabled={state === 'sending'}>
						<legend>Interested in <span class="optional">(optional)</span></legend>
						<div class="interest-options">
							{#each INTEREST_OPTIONS as option (option.value)}
								<label class="interest-option">
									<input
										type="radio"
										name="interest"
										value={option.value}
										bind:group={interest}
									/>
									<span>{option.label}</span>
								</label>
							{/each}
						</div>
					</fieldset>

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
							placeholder={copy.photoPlaceholder}
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
							placeholder={copy.sizePlaceholder}
							bind:value={size}
							disabled={state === 'sending'}
						/>
					</label>

					<!-- Wood/finish doesn't apply to cushion covers; enquiryChoiceFields()
					     also drops any value typed before the switch. -->
					{#if copy.showFinish}
						<label>
							<span>Wood or finish <span class="optional">(optional)</span></span>
							<input
								type="text"
								name="finish"
								maxlength="200"
								placeholder={copy.finishPlaceholder}
								bind:value={finish}
								disabled={state === 'sending'}
							/>
						</label>
					{/if}

					<label>
						<span>Where will it go? <span class="optional">(optional)</span></span>
						<input
							type="text"
							name="location"
							maxlength="200"
							placeholder={copy.locationPlaceholder}
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

	<!-- Wide screens only (display: none below 960px, so the lazy image
	     never loads on mobile). A real product photo, not decoration. -->
	<aside class="contact-aside" aria-label="From the studio">
		<figure class="contact-figure">
			<img
				src={asideSrc}
				alt={asideAlt}
				loading="lazy"
				decoding="async"
			/>
			<figcaption>
				{#if asideCaption}<span class="caption-name">{asideCaption}</span>{/if}
				<a href="/shop">Browse finished pieces in the shop</a>
			</figcaption>
		</figure>
	</aside>
	</div>
</section>

<style>
	/* Page-local palette tokens for the form alerts. Same co-location
	   pattern as Cart.svelte and the other transactional pages —
	   keeps these reds and greens out of app.css. */
	.contact-main {
		max-width: 680px;
		min-width: 0;
		--color-warn: #a2432f;
		--color-warn-soft: #f5e3e0;
		--color-warn-ink: #6b2a1b;
		--color-success: #4a6b3a;
		--color-success-soft: #e7efde;
		--color-success-ink: #2f4a25;
	}

	/* Mobile-first: one narrow column, like the other text pages. From
	   960px the image column joins beside the form. */
	.contact-layout {
		max-width: 680px;
	}

	.contact-aside {
		display: none;
	}

	@media (min-width: 960px) {
		.contact-layout {
			max-width: var(--max-width);
			display: grid;
			grid-template-columns: minmax(0, 680px) minmax(0, 1fr);
			gap: var(--space-5);
		}

		/* The aside stretches to the main column's height so the figure
		   can stay sticky within it. */
		.contact-aside {
			display: block;
		}

		.contact-figure {
			position: sticky;
			/* Clears the sticky site header (~73px, see +layout.svelte). */
			top: 6rem;
			margin: 0;
		}

		.contact-figure img {
			display: block;
			width: 100%;
			aspect-ratio: 4 / 5;
			object-fit: cover;
			border-radius: 2px;
			background: var(--color-rule);
		}

		.contact-figure figcaption {
			display: grid;
			gap: 0.15rem;
			margin-top: var(--space-1);
			font-size: 0.85rem;
			color: var(--color-ink-soft);
		}

		.caption-name {
			font-family: var(--font-display);
			font-style: italic;
			color: var(--color-ink);
		}
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

	/* Direct children only, so the interest pills below keep their own
	   styling. */
	.enquiry-form > label {
		display: grid;
		gap: 0.35rem;
	}

	.enquiry-form > label > span {
		font-size: 0.85rem;
		color: var(--color-ink-soft);
	}

	.required {
		color: var(--color-bark);
	}

	.optional {
		font-style: italic;
	}

	.interest {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}

	.interest legend {
		padding: 0;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
		color: var(--color-ink-soft);
	}

	/* Segmented control built on native radios: the input stays in the
	   accessibility tree and keyboard order; only its circle is hidden. */
	.interest-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.interest-option {
		position: relative;
		display: inline-flex;
	}

	.interest-option input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.interest-option span {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-ink);
		font-size: 0.9rem;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.interest-option:hover span {
		border-color: var(--color-bark);
	}

	.interest-option input:checked + span {
		background: var(--color-leaf-dark);
		border-color: var(--color-leaf-dark);
		color: var(--color-surface);
	}

	.interest-option input:focus-visible + span {
		outline: 2px solid var(--color-bark);
		outline-offset: 2px;
	}

	.interest:disabled .interest-option span {
		opacity: 0.6;
	}

	.interest:disabled .interest-option input {
		cursor: not-allowed;
	}

	@media (prefers-reduced-motion: reduce) {
		.interest-option span {
			transition: none;
		}
	}

	.enquiry-form input:not([type='radio']),
	.enquiry-form textarea {
		font: inherit;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-rule);
		background: var(--color-surface);
		border-radius: 2px;
		color: var(--color-ink);
	}

	.enquiry-form input:not([type='radio']):focus,
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
		background: var(--color-success-soft);
		border-left: 4px solid var(--color-success);
		color: var(--color-success-ink);
	}

	.alert--error {
		background: var(--color-warn-soft);
		border-left: 4px solid var(--color-warn);
		color: var(--color-warn-ink);
	}
</style>

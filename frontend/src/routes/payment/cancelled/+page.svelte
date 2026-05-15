<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { PUBLIC_API_URL } from '$env/static/public';
	import PayFastRedirecting from '$lib/PayFastRedirecting.svelte';
	import Button from '$lib/Button.svelte';

	const apiUrl = PUBLIC_API_URL;

	let ref = '';
	// Email is captured here, NOT read from the URL. The cancelled-page
	// URL is part of the PayFast redirect target (cancelUrl on the
	// signed form); putting the email in that URL would expose it via
	// the Referer header during the redirect chain and via
	// browser-history dumps. The customer types it fresh.
	let email = '';
	let submitting = false;
	// Flips once the POST returns signed form data and we're about to
	// navigate cross-origin to PayFast. Swaps the retry form for the
	// shared centered-spinner so the customer sees the same
	// "Redirecting to PayFast…" state as the cart checkout.
	let redirecting = false;
	let error: string | null = null;

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		ref = params.get('ref') ?? '';
	});

	function submitToPayFast(payfast: { action: string; fields: Record<string, string> }) {
		// Build the form via DOM APIs (no innerHTML / @html). Mirror
		// of frontend/src/lib/Cart.svelte:redirectToPayFast — the only
		// other place we POST to PayFast.
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = payfast.action;
		for (const [fieldName, value] of Object.entries(payfast.fields)) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = fieldName;
			input.value = value;
			form.appendChild(input);
		}
		document.body.appendChild(form);
		form.submit();
	}

	async function handleRetry(event: SubmitEvent) {
		event.preventDefault();
		if (!ref || !email.trim()) {
			error = 'Please enter the email address you used when placing the order.';
			return;
		}
		submitting = true;
		error = null;
		try {
			const url = `${apiUrl}/orders/${encodeURIComponent(ref)}/retry-payment?email=${encodeURIComponent(email.trim())}`;
			const res = await fetch(url, { method: 'POST' });
			if (res.status === 429) {
				error = "We've had too many retry attempts for this order in a short window. Please wait a few minutes and try again, or contact us if it keeps failing.";
				return;
			}
			if (!res.ok) {
				// 404 covers every auth/state failure on the server side.
				// Generic message — never leak which guard failed.
				error = "We couldn't retry that order. Double-check the email matches the one you used when placing the order, or contact us.";
				return;
			}
			const data = (await res.json()) as {
				payfast?: { action: string; fields: Record<string, string> };
			};
			if (data.payfast) {
				// Swap the form for the spinner BEFORE we kick the
				// navigation so the customer never sees the form briefly
				// re-enabled between fetch resolving and the redirect.
				redirecting = true;
				submitToPayFast(data.payfast);
				return;
			}
			error = "Couldn't reach PayFast. Please try again in a moment.";
		} catch (e) {
			console.error(e);
			error = 'Could not reach the order service. Please try again.';
		} finally {
			// Leave `submitting` set when we're redirecting — the form
			// is unmounted by the {#if !redirecting} branch, so the
			// button state doesn't matter, but flipping it back briefly
			// would be a visible blip if the redirect is slow.
			if (!redirecting) submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Payment cancelled — Meryl Green Designs</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Payment</p>
		<h1>Payment cancelled</h1>

		<div class="status-panel">
			{#if ref}
				<p class="lede">
					Your order <strong>{ref}</strong> has not been charged.
				</p>
			{/if}

			{#if ref}
				{#if redirecting}
					<PayFastRedirecting />
				{:else}
					<p>
						Cards sometimes get declined for routine reasons. You can retry
						payment for the same order without losing it — enter the email
						address you used when placing the order:
					</p>

					<form class="retry-form" on:submit={handleRetry}>
						<label for="cancelled-email">Email</label>
						<input
							id="cancelled-email"
							type="email"
							autocomplete="email"
							inputmode="email"
							required
							bind:value={email}
						/>
						<div class="retry-form__submit">
							<Button variant="primary" type="submit" disabled={submitting}>
								{#if submitting}Retrying…{:else}Retry payment{/if}
							</Button>
						</div>
					</form>

					{#if error}
						<div class="alert alert--error">{error}</div>
					{/if}

					<p class="hint">
						Prefer to start over? Return to the shop and place a fresh order.
					</p>
				{/if}
			{:else}
				<p>If you'd still like to complete your order, return to the shop and try again.</p>
			{/if}
		</div>

		{#if !redirecting}
			<div class="actions">
				<Button href="{base}/shop#order" variant="outlined">Return to the shop</Button>
			</div>
		{/if}
	</div>
</section>

<style>
	.narrow {
		max-width: 600px;
	}

	/* Page-local amber + warn tokens. Co-located rather than added to
	   app.css — these colours show up only on transitional payment
	   surfaces. Amber pair signals "needs attention" (matches /track's
	   retry section, same hex values, kept page-local until a third
	   surface needs them). Warn pair mirrors Cart.svelte's
	   --color-warn-* block byte-for-byte — same red, same purpose. */
	.status-panel {
		--color-amber: #c6952c;
		--color-amber-soft: #fdf4e8;
		--color-warn: #a2432f;
		--color-warn-soft: #f5e3e0;
		--color-warn-ink: #6b2a1b;

		background: var(--color-amber-soft);
		border-left: 4px solid var(--color-amber);
		padding: var(--space-3) var(--space-3);
		margin: var(--space-2) 0 var(--space-3);
		color: var(--color-ink);
	}

	.status-panel .lede {
		font-size: 1.05rem;
		margin: 0 0 var(--space-2);
	}

	.status-panel p {
		margin: 0 0 var(--space-2);
		line-height: 1.6;
	}

	.retry-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: var(--space-2) 0;
	}

	.retry-form label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-soft);
	}

	.retry-form input {
		font: inherit;
		font-size: 0.9rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-rule);
		background: var(--color-surface);
		color: var(--color-ink);
		border-radius: 2px;
		width: 100%;
		box-sizing: border-box;
	}

	.retry-form input:focus {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.retry-form__submit {
		margin-top: var(--space-1);
	}

	.alert {
		padding: var(--space-1) var(--space-2);
		border-radius: 2px;
		margin: var(--space-2) 0 0;
		font-size: 0.9rem;
	}

	.alert--error {
		background: var(--color-warn-soft);
		border-left: 4px solid var(--color-warn);
		color: var(--color-warn-ink);
	}

	.hint {
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		margin: var(--space-2) 0 0;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>

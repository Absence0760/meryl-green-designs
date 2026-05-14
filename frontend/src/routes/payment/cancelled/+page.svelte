<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { PUBLIC_API_URL } from '$env/static/public';

	const apiUrl = PUBLIC_API_URL;

	let ref = '';
	// Email is captured here, NOT read from the URL. The cancelled-page
	// URL is part of the PayFast redirect target (cancelUrl on the
	// signed form); putting the email in that URL would expose it via
	// the Referer header during the redirect chain and via
	// browser-history dumps. The customer types it fresh.
	let email = '';
	let submitting = false;
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
				submitToPayFast(data.payfast);
				return;
			}
			error = "Couldn't reach PayFast. Please try again in a moment.";
		} catch (e) {
			console.error(e);
			error = 'Could not reach the order service. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Payment cancelled — Meryl Green Designs</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="section">
	<div class="container narrow">
		<div class="status-card">
			<h1>Payment cancelled</h1>

			{#if ref}
				<p>
					Your order <strong>{ref}</strong> has not been charged.
				</p>
			{/if}

			{#if ref}
				<p>
					Cards sometimes get declined for routine reasons. You can retry
					payment for the same order without losing it — enter the email
					address you used when placing the order:
				</p>

				<form class="retry-form" on:submit={handleRetry}>
					<label>
						<span>Email</span>
						<input
							type="email"
							autocomplete="email"
							inputmode="email"
							required
							bind:value={email}
						/>
					</label>
					<button class="btn" type="submit" disabled={submitting}>
						{#if submitting}Retrying…{:else}Retry payment{/if}
					</button>
				</form>

				{#if error}
					<div class="alert alert--error">{error}</div>
				{/if}

				<p class="hint">
					Prefer to start over? Return to the shop and place a fresh order.
				</p>
			{:else}
				<p>If you'd still like to complete your order, return to the shop and try again.</p>
			{/if}

			<div class="actions">
				<a class="btn btn--secondary" href="{base}/shop#order">Return to the shop</a>
			</div>
		</div>
	</div>
</section>

<style>
	.narrow {
		max-width: 600px;
	}

	.status-card {
		background: #fdf4e8;
		border-left: 4px solid #c6952c;
		padding: var(--space-3) var(--space-4);
		margin: var(--space-4) 0;
		color: var(--color-ink);
	}

	.status-card h1 {
		font-size: 1.3rem;
		margin: 0 0 var(--space-2);
	}

	.status-card p {
		margin: 0 0 var(--space-1);
		line-height: 1.6;
	}

	.retry-form {
		display: grid;
		gap: 0.5rem;
		margin: var(--space-2) 0;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		padding: var(--space-2);
		border-radius: 2px;
	}

	.retry-form label {
		display: grid;
		gap: 0.25rem;
	}

	.retry-form label span {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-ink-soft);
	}

	.retry-form input {
		font: inherit;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-rule);
		background: var(--color-bg);
		color: var(--color-ink);
		border-radius: 2px;
	}

	.retry-form input:focus {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.alert {
		padding: var(--space-1) var(--space-2);
		border-radius: 2px;
		margin: var(--space-2) 0;
		font-size: 0.9rem;
	}

	.alert--error {
		background: #f5e3e0;
		border-left: 4px solid #a2432f;
		color: #6b2a1b;
	}

	.hint {
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		margin-top: var(--space-2);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.btn {
		display: inline-block;
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		border: none;
		padding: 0.65rem var(--space-2);
		font: inherit;
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: center;
		cursor: pointer;
		text-decoration: none;
		border-bottom: none;
	}

	.btn:hover {
		background: #244019;
	}

	.btn:disabled {
		background: #a8afa0;
		cursor: not-allowed;
	}

	.btn--secondary {
		background: var(--color-bg);
		color: var(--color-leaf-dark);
		border: 1px solid var(--color-leaf-dark);
	}

	.btn--secondary:hover {
		background: var(--color-leaf-dark);
		color: #f6f4ee;
	}
</style>

<script lang="ts">
	import { PUBLIC_API_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import Button from '$lib/Button.svelte';
	import PayFastRedirecting from '$lib/PayFastRedirecting.svelte';
	import { safeHttpUrl } from '$lib/safeHttpUrl';

	type Shipping = {
		carrier: string | null;
		trackingNumber: string | null;
		trackingUrl: string | null;
	};

	type OrderResponse = {
		ref: string;
		status:
			| 'pending_payment'
			| 'payment_received'
			| 'shipped'
			| 'delivered'
			| 'cancelled';
		customerName: string;
		items: string;
		shipping: Shipping | null;
		createdAt: string;
		updatedAt: string;
	};

	const apiUrl = PUBLIC_API_URL;

	let ref = '';
	let email = '';
	let loading = false;
	let error: string | null = null;
	let order: OrderResponse | null = null;
	let retrying = false;
	// Flips once the retry POST returns signed form data and we're
	// about to navigate cross-origin to PayFast. Swaps the retry CTA
	// for the shared centered-spinner so the customer sees the same
	// "Redirecting to PayFast…" state as the cart checkout.
	let redirectingToPayFast = false;
	let retryError: string | null = null;

	const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

	$: canRetry =
		order != null &&
		order.status === 'pending_payment' &&
		Number.isFinite(Date.parse(order.createdAt)) &&
		Date.now() - Date.parse(order.createdAt) < RETRY_WINDOW_MS;

	const STATUS_STEPS: Array<{ value: OrderResponse['status']; label: string }> = [
		{ value: 'pending_payment', label: 'Pending payment' },
		{ value: 'payment_received', label: 'Payment received' },
		{ value: 'shipped', label: 'Shipped' },
		{ value: 'delivered', label: 'Delivered' }
	];

	const STATUS_LABELS: Record<OrderResponse['status'], string> = {
		pending_payment: 'Pending payment',
		payment_received: 'Payment received',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};

	function stepIndex(status: OrderResponse['status']): number {
		const idx = STATUS_STEPS.findIndex((s) => s.value === status);
		return idx;
	}

	async function lookupOrder() {
		if (!ref.trim() || !email.trim()) {
			error = 'Please enter both an order reference and your email.';
			return;
		}
		loading = true;
		error = null;
		order = null;

		try {
			const url = `${apiUrl}/orders/${encodeURIComponent(ref.trim())}?email=${encodeURIComponent(email.trim())}`;
			const res = await fetch(url);
			if (res.status === 404) {
				error =
					"We couldn't find an order matching that reference and email. Please double-check both.";
				return;
			}
			if (!res.ok) {
				error = 'Order lookup failed. Please try again in a moment.';
				return;
			}
			order = (await res.json()) as OrderResponse;
		} catch (e) {
			console.error(e);
			error = 'Could not reach the order service. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void lookupOrder();
	}

	function submitToPayFast(payfast: { action: string; fields: Record<string, string> }) {
		// DOM-built form, mirror of Cart.svelte:redirectToPayFast.
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = payfast.action;
		for (const [name, value] of Object.entries(payfast.fields)) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = name;
			input.value = value;
			form.appendChild(input);
		}
		document.body.appendChild(form);
		form.submit();
	}

	async function handleRetry(event: SubmitEvent) {
		// Form submit (not an <a href>) so the email isn't placed in a
		// URL that PayFast would receive via the Referer header on the
		// cross-origin redirect. Email is read from the in-memory
		// `email` state, NOT from URL params on a click.
		event.preventDefault();
		if (!order || !canRetry) return;
		retrying = true;
		retryError = null;
		try {
			const url = `${apiUrl}/orders/${encodeURIComponent(order.ref)}/retry-payment?email=${encodeURIComponent(email.trim())}`;
			const res = await fetch(url, { method: 'POST' });
			if (res.status === 429) {
				retryError =
					"We've had too many retry attempts for this order in a short window. Please wait a few minutes, or contact us if it keeps failing.";
				return;
			}
			if (!res.ok) {
				retryError =
					"We couldn't retry that order. Please contact us if the issue persists.";
				return;
			}
			const data = (await res.json()) as {
				payfast?: { action: string; fields: Record<string, string> };
			};
			if (data.payfast) {
				// Swap the retry section for the spinner BEFORE we kick
				// the navigation so the customer never sees the CTA
				// briefly re-enabled between fetch resolving and the
				// redirect.
				redirectingToPayFast = true;
				submitToPayFast(data.payfast);
				return;
			}
			retryError = "Couldn't reach PayFast. Please try again in a moment.";
		} catch (e) {
			console.error(e);
			retryError = 'Could not reach the order service. Please try again.';
		} finally {
			// Leave `retrying` set when we're redirecting — the CTA is
			// unmounted by the {#if redirectingToPayFast} branch, but
			// flipping the flag back briefly would still re-render the
			// disabled label as a visible blip if the redirect is slow.
			if (!redirectingToPayFast) retrying = false;
		}
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const r = params.get('ref');
		const e = params.get('email');
		if (r) ref = r;
		if (e) email = e;
		if (r && e) {
			void lookupOrder();
		}
	});

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString('en-ZA', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>Track your order — Meryl Green Designs</title>
	<meta
		name="description"
		content="Track the status of your Meryl Green Designs order using your reference and email."
	/>
	<meta property="og:title" content="Track your order — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Track the status of your Meryl Green Designs order using your reference and email."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Track your order</p>
		<h1>Order status</h1>
		<p class="lede">
			Enter the order reference we emailed you and the email address you used when
			placing the order.
		</p>

		<form class="track-form" on:submit={handleSubmit}>
			<label>
				<span>Order reference</span>
				<input
					type="text"
					placeholder="MG-YYMMDD-XXXXXX"
					bind:value={ref}
					autocomplete="off"
				/>
			</label>
			<label>
				<span>Email</span>
				<input type="email" bind:value={email} autocomplete="email" />
			</label>
			<div class="track-form__submit">
				<Button type="submit" variant="primary" disabled={loading}>
					{loading ? 'Looking up…' : 'Look up order'}
				</Button>
			</div>
		</form>

		{#if error}
			<div class="alert alert--error">{error}</div>
		{/if}

		{#if order}
			<article class="order-card">
				<header>
					<p class="eyebrow">Order {order.ref}</p>
					<h2>Hi {order.customerName}</h2>
					<p class="status-badge status-badge--{order.status}">
						{STATUS_LABELS[order.status]}
					</p>
				</header>

				{#if order.status !== 'cancelled'}
					<ol class="status-steps" aria-label="Order progress">
						{#each STATUS_STEPS as step, i}
							{@const current = stepIndex(order.status)}
							<li
								class="status-step"
								class:status-step--done={i < current}
								class:status-step--current={i === current}
							>
								<span class="status-step__marker" aria-hidden="true"></span>
								<span class="status-step__label">{step.label}</span>
							</li>
						{/each}
					</ol>
				{/if}

				{#if canRetry}
					<section class="retry-section">
						{#if redirectingToPayFast}
							<PayFastRedirecting />
						{:else}
							<h3>Payment hasn't gone through yet</h3>
							<p>
								Cards sometimes get declined for routine reasons. You can
								retry payment for this order — you'll be redirected back to
								PayFast.
							</p>
							<form on:submit={handleRetry}>
								<button class="retry-btn" type="submit" disabled={retrying}>
									{#if retrying}Retrying…{:else}Retry payment{/if}
								</button>
							</form>
							{#if retryError}
								<div class="alert alert--error">{retryError}</div>
							{/if}
						{/if}
					</section>
				{/if}

				<section class="order-section">
					<h3>Items</h3>
					<pre class="items">{order.items}</pre>
				</section>

				{#if order.shipping}
					<section class="order-section">
						<h3>Shipping</h3>
						{#if order.shipping.carrier}
							<p><strong>Carrier:</strong> {order.shipping.carrier}</p>
						{/if}
						{#if order.shipping.trackingNumber}
							<p><strong>Tracking number:</strong> {order.shipping.trackingNumber}</p>
						{/if}
						{#if safeHttpUrl(order.shipping.trackingUrl)}
							<p>
								<a href={safeHttpUrl(order.shipping.trackingUrl)} target="_blank" rel="noopener noreferrer">
									Track your parcel
								</a>
							</p>
						{/if}
					</section>
				{/if}

				<footer class="order-meta">
					<p>Placed on {formatDate(order.createdAt)}</p>
					<p>Last updated {formatDate(order.updatedAt)}</p>
				</footer>
			</article>
		{/if}
	</div>
</section>

<style>
	.narrow {
		max-width: 680px;
	}

	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: var(--space-3);
	}

	.track-form {
		display: grid;
		gap: var(--space-2);
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		padding: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.track-form label {
		display: grid;
		gap: 0.25rem;
	}

	.track-form label span {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-ink-soft);
	}

	.track-form input {
		font: inherit;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-rule);
		background: var(--color-bg);
		color: var(--color-ink);
		border-radius: 2px;
	}

	.track-form input:focus {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.track-form__submit {
		margin-top: var(--space-1);
	}

	.alert {
		padding: var(--space-2) var(--space-3);
		border-radius: 2px;
		margin-bottom: var(--space-3);
	}

	.alert--error {
		background: #f5e3e0;
		border-left: 4px solid #a2432f;
		color: #6b2a1b;
	}

	.order-card {
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		padding: var(--space-3);
		border-left: 4px solid var(--color-leaf);
	}

	.order-card header {
		margin-bottom: var(--space-3);
	}

	.order-card h2 {
		margin: 0 0 var(--space-1);
	}

	.status-badge {
		display: inline-block;
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-radius: 2px;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		color: var(--color-ink-soft);
	}

	.status-badge--pending_payment {
		background: #fff4d6;
		border-color: #e0c065;
		color: #6a5010;
	}

	.status-badge--payment_received {
		background: #dce8f7;
		border-color: #6e9fd0;
		color: #1d3c68;
	}

	.status-badge--shipped {
		background: #e4eddb;
		border-color: var(--color-leaf);
		color: var(--color-leaf-dark);
	}

	.status-badge--delivered {
		background: #d0e0c4;
		border-color: var(--color-leaf-dark);
		color: #1a2e10;
	}

	.status-badge--cancelled {
		background: #eadede;
		border-color: #8a6969;
		color: #552c2c;
	}

	.status-steps {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-3);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		counter-reset: step;
	}

	.status-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--color-rule);
		border-radius: 2px;
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		background: var(--color-bg);
	}

	.status-step__marker {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--color-rule);
	}

	.status-step--done {
		color: var(--color-leaf-dark);
	}

	.status-step--done .status-step__marker {
		background: var(--color-leaf);
	}

	.status-step--current {
		background: var(--color-surface);
		border-color: var(--color-leaf);
		color: var(--color-leaf-dark);
		font-weight: 600;
	}

	.status-step--current .status-step__marker {
		background: var(--color-leaf-dark);
	}

	.retry-section {
		padding: var(--space-2);
		margin: var(--space-2) 0;
		background: #fdf4e8;
		border-left: 4px solid #c6952c;
		border-radius: 2px;
	}

	.retry-section h3 {
		margin: 0 0 var(--space-1);
		font-size: 1rem;
	}

	.retry-section p {
		margin: 0 0 var(--space-2);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.retry-btn {
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		border: none;
		padding: 0.55rem var(--space-2);
		font: inherit;
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		border-radius: 2px;
	}

	.retry-btn:hover {
		background: #244019;
	}

	.retry-btn:disabled {
		background: #a8afa0;
		cursor: not-allowed;
	}

	.order-section {
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-rule);
	}

	.order-section h3 {
		margin: 0 0 var(--space-1);
		font-size: 1rem;
	}

	.items {
		font-family: inherit;
		white-space: pre-wrap;
		margin: 0;
		color: var(--color-ink-soft);
	}

	.order-meta {
		border-top: 1px solid var(--color-rule);
		padding-top: var(--space-2);
		margin-top: var(--space-2);
		font-size: 0.85rem;
		color: var(--color-ink-soft);
	}

	.order-meta p {
		margin: 0.15rem 0;
	}
</style>

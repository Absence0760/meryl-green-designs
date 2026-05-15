<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	let ref = '';

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		ref = params.get('ref') ?? '';
	});
</script>

<svelte:head>
	<title>Payment complete — Meryl Green Designs</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="section">
	<div class="container narrow">
		<div class="status-card">
			<h1>Thank you — your payment is being processed</h1>

			{#if ref}
				<p>
					Your order reference is <strong>{ref}</strong>. Save this
					for your records — you'll need it (with the email you used
					when ordering) to look up your order later.
				</p>
			{/if}

			<p>
				PayFast is confirming your payment. You'll receive an email
				once it's been confirmed and your order is ready to ship. If
				you don't see it within an hour (check your spam folder
				first), <a href="{base}/contact">get in touch</a> and we'll
				re-send it.
			</p>

			<p>You can track your order at any time:</p>

			<div class="actions">
				{#if ref}
					<a class="btn" href="{base}/track?ref={encodeURIComponent(ref)}">
						Track your order
					</a>
				{/if}
				<a class="btn btn--secondary" href="{base}/shop">
					Back to the shop
				</a>
			</div>
		</div>
	</div>
</section>

<style>
	.narrow {
		max-width: 600px;
	}

	.status-card {
		background: #e4eddb;
		border-left: 4px solid var(--color-leaf);
		padding: var(--space-3) var(--space-4);
		margin: var(--space-4) 0;
		color: var(--color-leaf-dark);
	}

	.status-card h1 {
		font-size: 1.3rem;
		margin: 0 0 var(--space-2);
	}

	.status-card p {
		margin: 0 0 var(--space-1);
		line-height: 1.6;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
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

	.btn--secondary {
		background: transparent;
		color: var(--color-leaf-dark);
		border: 1px solid var(--color-leaf-dark);
	}

	.btn--secondary:hover {
		background: var(--color-leaf-dark);
		color: #f6f4ee;
	}
</style>

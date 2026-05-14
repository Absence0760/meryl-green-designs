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

			<p>
				If you'd still like to complete your order, return to the shop and
				try again.
			</p>

			<div class="actions">
				<a class="btn" href="{base}/shop#order">
					Return to the shop
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
</style>

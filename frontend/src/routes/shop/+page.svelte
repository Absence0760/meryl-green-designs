<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { base } from '$app/paths';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';
	import { isDemoMode, demoProducts } from '$lib/demo';
	import { cart } from '$lib/cartStore.svelte';

	const apiUrl = PUBLIC_API_URL;

	// Products are fetched client-side after mount so the page shell can
	// render instantly. skeletonCount sets how many placeholder cards to
	// show while the real data is loading. In demo mode we skip the fetch
	// entirely and render the hardcoded demoProducts on first paint.
	let products: Product[] = isDemoMode ? demoProducts : [];
	let productsLoading = !isDemoMode;
	let productsError: string | null = null;
	const skeletonCount = 6;

	function productMainImage(product: Product): string | null {
		const first = product.photos?.[0];
		return first ? imageUrl(first, 640) : null;
	}

	function addToCart(product: Product) {
		cart.add(product);
	}

	onMount(async () => {
		// Demo builds seed `products` synchronously above — nothing to fetch.
		if (isDemoMode) return;

		try {
			const res = await fetch(`${apiUrl}/products`);
			if (!res.ok) {
				productsError = 'Could not load products right now. Please refresh to try again.';
				return;
			}
			const body = (await res.json()) as { products?: Product[] };
			products = body.products ?? [];
		} catch (e) {
			console.error('Failed to fetch products', e);
			productsError = 'Could not load products right now. Please refresh to try again.';
		} finally {
			productsLoading = false;
		}
	});
</script>

<svelte:head>
	<title>Shop — Meryl Green Designs</title>
	<meta
		name="description"
		content="Finished pieces from Meryl Green Designs — printed on durable cotton canvas, framed in stained Meranti hardwood. Pay securely with card, Apple Pay, or EFT."
	/>
	<meta property="og:title" content="Shop — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Finished pieces from Meryl Green Designs — printed on durable cotton canvas, framed in stained Meranti hardwood. Pay securely with card, Apple Pay, or EFT."
	/>
</svelte:head>

<section class="section">
	<div class="container">
		<p class="eyebrow">Shop</p>
		<h1>Finished products</h1>
		<p class="lede">
			A selection of finished pieces from Meryl Green Designs, available to order.
		</p>

		<dl class="specs">
			<div class="specs__row">
				<dt>Frame</dt>
				<dd>Meranti hardwood, finished with a traditional teak stain</dd>
			</div>
			<div class="specs__row">
				<dt>Canvas</dt>
				<dd>100% cotton, digitally printed with a protective colour-fast coating</dd>
			</div>
		</dl>
	</div>
</section>

<section class="backdrop" style="background-image: url('{base}/water2.JPG')">
	<div class="container">
		{#if productsLoading}
			<div class="product-grid" aria-busy="true" aria-label="Loading products">
				{#each Array(skeletonCount) as _, i (i)}
					<article class="product product--skeleton" aria-hidden="true">
						<div class="product-image skeleton-shimmer"></div>
						<div class="product-body">
							<div class="skeleton-line skeleton-line--title"></div>
							<div class="skeleton-line skeleton-line--sm"></div>
							<div class="skeleton-line skeleton-line--price"></div>
						</div>
					</article>
				{/each}
			</div>
		{:else if productsError}
			<div class="alert alert--error">{productsError}</div>
		{:else if products.length === 0}
			<div class="empty">
				<p>
					No products are listed yet. Once Meryl adds them in the content studio, they'll
					appear here automatically.
				</p>
			</div>
		{:else}
			<div class="product-grid">
				{#each products as product (product._id)}
					{@const photo = productMainImage(product)}
					<article class="product">
						{#if photo}
							<img
								class="product-image product-image--photo"
								src={photo}
								alt={product.photos?.[0]?.alt ?? product.name}
								loading="lazy"
							/>
						{:else}
							<div class="product-image">Product photo</div>
						{/if}
						<div class="product-body">
							<h3>{product.name}</h3>
							{#if product.blurb}
								<p class="blurb">{product.blurb}</p>
							{/if}
							{#if product.description?.trim()}
								<p class="description">{product.description}</p>
							{/if}
							<p class="price">{formatPrice(product.priceZar)}</p>
							<button
								class="btn"
								on:click={() => addToCart(product)}
								disabled={product.priceZar == null}
							>
								Add to order
							</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</section>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Payment</p>
		<h2>How to pay</h2>
		<ol class="payment-steps">
			<li>Add items to your order using the "Add to order" buttons above.</li>
			<li>Open your cart using the cart icon in the header.</li>
			<li>Fill in your details and click "Pay now".</li>
			<li>
				You'll be securely redirected to PayFast to complete your payment
				with a credit or debit card, Apple Pay, SnapScan, or other
				supported methods.
			</li>
			<li>Once payment is confirmed, we ship your order.</li>
		</ol>
		<p class="note">
			All payments are processed securely by PayFast. We never see your
			card details.
		</p>
	</div>
</section>

<style>
	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: 0;
	}

	.backdrop {
		background-color: #c8d1b9;
		background-size: cover;
		background-position: center;
		padding: var(--space-4) 0 var(--space-6);
	}

	.specs {
		margin: 0 0 var(--space-4);
		padding: 0 0 0 var(--space-2);
		border-left: 2px solid var(--color-rule);
		max-width: 60ch;
		display: grid;
		gap: 0.4rem;
	}

	.specs__row {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		gap: var(--space-2);
		align-items: baseline;
	}

	.specs dt {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-soft);
	}

	.specs dd {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--color-ink);
	}

	@media (max-width: 480px) {
		.specs__row {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	.narrow {
		max-width: 680px;
	}

	.product-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-3);
	}

	.product {
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}

	.product-image {
		aspect-ratio: 1 / 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-linear-gradient(
			45deg,
			#e3e6da 0 16px,
			#d8dccd 16px 32px
		);
		color: var(--color-ink-soft);
		font-family: var(--font-display);
		font-style: italic;
	}

	.product-image--photo {
		object-fit: cover;
		width: 100%;
		height: auto;
		background: none;
	}

	.empty {
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px dashed var(--color-rule);
		text-align: center;
		color: var(--color-ink-soft);
		font-style: italic;
	}

	/* ----- skeleton loading state ----- */
	.product--skeleton {
		pointer-events: none;
	}

	.skeleton-shimmer,
	.skeleton-line {
		background: linear-gradient(
			90deg,
			#e3e6da 0%,
			#f2f4ea 50%,
			#e3e6da 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.4s infinite linear;
	}

	.skeleton-line {
		height: 0.9rem;
		border-radius: 2px;
		margin-bottom: 0.4rem;
	}

	.skeleton-line--title {
		height: 1.1rem;
		width: 70%;
	}

	.skeleton-line--sm {
		height: 0.75rem;
		width: 90%;
	}

	.skeleton-line--price {
		height: 0.9rem;
		width: 35%;
		margin-top: auto;
	}

	@keyframes skeleton-shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-shimmer,
		.skeleton-line {
			animation: none;
		}
	}

	.product-body {
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
		min-height: 0;
	}

	.product-body h3 {
		margin: 0;
		font-size: 1.15rem;
	}

	.blurb {
		margin: 0;
		color: var(--color-ink-soft);
		font-size: 0.9rem;
		font-style: italic;
	}

	.description {
		margin: 0;
		color: var(--color-ink-soft);
		font-size: 0.85rem;
		line-height: 1.55;
		white-space: pre-line;
	}

	.price {
		margin: 0;
		margin-top: auto;
		padding-top: var(--space-2);
		font-weight: 600;
		color: var(--color-leaf-dark);
	}

	.btn {
		margin-top: var(--space-1);
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

	button[disabled] {
		background: #a8afa0;
		cursor: not-allowed;
	}

	.alert--error {
		background: #f5e3e0;
		border-left: 4px solid #a2432f;
		color: #6b2a1b;
		padding: var(--space-2) var(--space-3);
		border-radius: 2px;
	}

	.payment-steps {
		margin: var(--space-2) 0 var(--space-2);
		padding-left: 1.2rem;
		display: grid;
		gap: 0.5rem;
		color: var(--color-ink);
	}

	.payment-steps li {
		line-height: 1.5;
	}

	.note {
		font-size: 0.9rem;
		color: var(--color-ink-soft);
		margin: 0;
		font-style: italic;
	}
</style>

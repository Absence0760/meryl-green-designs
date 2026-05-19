<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';
	import { cart } from '$lib/cartStore.svelte';
	import Button from '$lib/Button.svelte';

	const apiUrl = PUBLIC_API_URL;

	let products: Product[] = [];
	let productsLoading = true;
	let productsError: string | null = null;
	const skeletonCount = 6;

	function productMainImage(product: Product): string | null {
		const first = product.photos?.[0];
		return first ? imageUrl(first, 640) : null;
	}

	// Second photo (if uploaded) is revealed on hover. Classic e-commerce
	// pattern — primary photo shows the product, secondary shows a detail
	// crop or alternate angle.
	function productHoverImage(product: Product): string | null {
		const second = product.photos?.[1];
		return second ? imageUrl(second, 640) : null;
	}

	function addToCart(product: Product) {
		cart.add(product);
	}

	onMount(async () => {
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
			<div class="specs__row">
				<dt>Lead time</dt>
				<dd>Made to order — typically 3 weeks from payment to dispatch</dd>
			</div>
		</dl>
	</div>
</section>

<section class="section section--products">
	<div class="container">
		{#if productsLoading}
			<div class="product-grid" aria-busy="true" aria-label="Loading products">
				{#each Array(skeletonCount) as _, i (i)}
					<article class="product product--skeleton" aria-hidden="true">
						<div class="product-image skeleton-shimmer"></div>
						<div class="product-body">
							<div class="skeleton-line skeleton-line--title"></div>
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
					{@const hover = productHoverImage(product)}
					<article class="product">
						<a class="product-link" href="/shop/{product.slug}" aria-label="View {product.name}">
							{#if photo}
								<div class="product-image-stack">
									<img
										class="product-image product-image--photo product-image--primary"
										src={photo}
										alt={product.photos?.[0]?.alt ?? product.name}
										loading="lazy"
									/>
									{#if hover}
										<!-- Not lazy-loaded — the secondary is stacked behind the
										     primary with opacity: 0, and some browsers treat that
										     as non-visible and defer loading, which causes a flash
										     of empty cream on first hover. Loading eagerly costs
										     one extra request per product but eliminates the flash. -->
										<img
											class="product-image product-image--photo product-image--secondary"
											src={hover}
											alt={product.photos?.[1]?.alt ?? product.name}
											aria-hidden="true"
										/>
									{/if}
								</div>
							{:else}
								<div class="product-image">Product photo</div>
							{/if}
							<div class="product-body">
								<h3>{product.name}</h3>
								{#if product.dimensions}
									<p class="dimensions">{product.dimensions}</p>
								{/if}
								<p class="price">{formatPrice(product.priceZar)}</p>
							</div>
						</a>
						<div class="product-cta">
							<Button
								variant="outlined"
								size="sm"
								on:click={() => addToCart(product)}
								disabled={!product.priceZar}
							>
								Add to order
							</Button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</section>

<section class="section">
	<div class="container narrow payment-panel">
		<p class="eyebrow">Secure checkout</p>
		<p class="payment-lede">
			Checkout is handled by <strong>PayFast</strong> — we never see your
			card details. Once payment clears, your piece is made to order and
			typically dispatched within 3 weeks.
		</p>
		<ul class="payment-methods" aria-label="Accepted payment methods">
			<li>Credit &amp; debit cards</li>
			<li>Apple Pay</li>
			<li>SnapScan</li>
			<li>Instant EFT</li>
		</ul>
	</div>
</section>

<style>
	/* Page-local warn token. Same co-location pattern the rest of the
	   site uses (cart / track / contact / gallery / payment-cancelled). */
	.section--products {
		--color-warn: #a2432f;
		--color-warn-soft: #f5e3e0;
		--color-warn-ink: #6b2a1b;
	}

	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: 0;
	}

	.section--products {
		padding-top: 0;
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
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-4) var(--space-3);
	}

	/* Edge-to-edge INKE-style tile: no card chrome, no border, no shadow.
	   The image IS the tile visual. Text sits directly on the backdrop. */
	.product {
		display: flex;
		flex-direction: column;
		background: none;
		border: none;
		border-radius: 0;
		overflow: visible;
		box-shadow: none;
	}

	.product-link {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		border-bottom: none;
	}

	.product-link:hover {
		color: inherit;
		border-bottom: none;
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

	/* Stack container so the primary and secondary (hover-reveal) photos
	   occupy the same box. The product's `aspect-ratio: 1 / 1` is moved
	   onto the stack wrapper itself. */
	.product-image-stack {
		position: relative;
		aspect-ratio: 1 / 1;
		overflow: hidden;
	}

	/* Subtle cream under the photo. Serves two jobs:
	   1. When a product PNG has transparency (current uploads), the
	      cream reads as a white-backed studio shot instead of letting
	      the page background show through.
	   2. When Meryl uploads real lifestyle photography with its own
	      background, the cream is fully hidden anyway — invisible. */
	.product-image--photo {
		object-fit: cover;
		width: 100%;
		height: 100%;
		background: var(--color-surface);
	}

	.product-image--primary,
	.product-image--secondary {
		position: absolute;
		inset: 0;
		transition: opacity 280ms ease;
	}

	.product-image--secondary {
		opacity: 0;
	}

	/* Reveal the secondary on hover of the stack. No need to guard on a
	   `has-hover` class because the secondary only exists in the DOM
	   when a second photo is uploaded. For products with one photo, the
	   selectors simply match nothing. `:has(...)` guards the primary
	   fade-out so single-photo tiles don't flash on hover. */
	.product-image-stack:hover .product-image--secondary,
	.product-image-stack:focus-within .product-image--secondary {
		opacity: 1;
	}

	.product-image-stack:hover:has(.product-image--secondary) .product-image--primary,
	.product-image-stack:focus-within:has(.product-image--secondary) .product-image--primary {
		opacity: 0;
	}

	/* Touch devices get no hover reveal — show only the primary. */
	@media (hover: none) {
		.product-image--secondary {
			display: none;
		}
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
		padding: var(--space-2) 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
		min-height: 0;
		text-align: center;
	}

	.product-body h3 {
		margin: 0;
		font-size: 1rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-ink);
		font-family: var(--font-body);
		font-weight: 500;
	}

	.dimensions {
		margin: 0;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-soft);
	}

	.price {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 500;
		color: var(--color-bark);
		letter-spacing: 0.02em;
	}

	.product-cta {
		display: flex;
		justify-content: center;
		margin-top: 0.25rem;
	}

	.alert--error {
		background: var(--color-warn-soft);
		border-left: 4px solid var(--color-warn);
		color: var(--color-warn-ink);
		padding: var(--space-2) var(--space-3);
		border-radius: 2px;
	}

	.payment-panel {
		text-align: center;
	}

	.payment-lede {
		margin: 0 auto var(--space-2);
		font-size: 1.05rem;
		line-height: 1.6;
		color: var(--color-ink);
		max-width: 48ch;
	}

	.payment-methods {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.payment-methods li {
		padding: 0.35rem 0.85rem;
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-soft);
	}
</style>

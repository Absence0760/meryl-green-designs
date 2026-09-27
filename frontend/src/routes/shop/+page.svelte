<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import type { Product } from '$lib/sanity';
	import { groupProductsByCategory } from '$lib/productGroups';
	import { cart } from '$lib/cartStore.svelte';
	import Button from '$lib/Button.svelte';
	import ProductCard from '$lib/ProductCard.svelte';
	import { reveal } from '$lib/reveal';

	const apiUrl = PUBLIC_API_URL;

	let products: Product[] = [];
	let productsLoading = true;
	let productsError: string | null = null;
	const skeletonCount = 6;

	$: sections = groupProductsByCategory(products);

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

	const metaDescription =
		'Folding screens and cushion covers from Meryl Green Designs, featuring photographs of the African bush. Pay securely with card, Apple Pay, or EFT.';
</script>

<svelte:head>
	<title>Shop — Meryl Green Designs</title>
	<meta name="description" content={metaDescription} />
	<meta property="og:title" content="Shop — Meryl Green Designs" />
	<meta property="og:description" content={metaDescription} />
</svelte:head>

<section class="section section--intro">
	<div class="container">
		<p class="eyebrow">Shop</p>
		<h1>Finished products</h1>
		<p class="lede">
			Folding screens and cushion covers from Meryl Green Designs, available to order.
		</p>
	</div>
</section>

<section class="section section--products">
	<div class="container">
		{#if productsLoading}
			<div class="product-grid" aria-busy="true" aria-label="Loading products">
				{#each Array(skeletonCount) as _, i (i)}
					<article class="product product--skeleton" aria-hidden="true">
						<div class="skeleton-image skeleton-shimmer"></div>
						<div class="skeleton-body">
							<div class="skeleton-line skeleton-line--title"></div>
							<div class="skeleton-line skeleton-line--price"></div>
						</div>
					</article>
				{/each}
			</div>
		{:else if productsError}
			<div class="alert alert--error" role="alert">{productsError}</div>
		{:else if products.length === 0}
			<div class="empty">
				<p>
					No products are listed yet. Once Meryl adds them in the content studio, they'll
					appear here automatically.
				</p>
			</div>
		{:else}
			{#each sections as section, sectionIndex (section.category)}
				<section class="category" aria-labelledby="category-{section.category}">
					<header class="category__header">
						<h2 id="category-{section.category}" class="category__title">{section.heading}</h2>
						{#if section.category === 'screen'}
							<!-- Construction shared by every folding screen. Screens only;
							     cushion covers get no spec list until their details are known. -->
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
						{:else if section.category === 'cushion-cover'}
							<!-- TODO(Meryl): cushion cover fabric / insert specs. Lead
							     time matches screens (3 weeks) but is stated without the
							     "made to order" claim until Meryl confirms covers are
							     made to order (it affects the ECT Act s44 exemption). -->
							<dl class="specs">
								<div class="specs__row">
									<dt>Lead time</dt>
									<dd>Typically 3 weeks from payment to dispatch</dd>
								</div>
							</dl>
						{/if}
					</header>
					<div class="product-grid">
						{#each section.products as product, i (product._id)}
							<article class="product" use:reveal={{ delay: (i % 3) * 90 }}>
								<!-- First row of the first category is above the fold
								     (and holds the LCP photo): no lazy-load. -->
								<ProductCard {product} priority={sectionIndex === 0 && i < 3} />
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
				</section>
			{/each}
		{/if}
	</div>
</section>

<section class="section">
	<div class="container narrow payment-panel">
		<p class="eyebrow">Secure checkout</p>
		<p class="payment-lede">
			Checkout is handled by <strong>PayFast</strong> — we never see your
			card details. Folding screens are made to order once payment clears,
			and every piece is typically dispatched within 3 weeks.
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
		padding-top: 0;
	}

	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: 0;
	}

	.narrow {
		max-width: 680px;
	}

	/* ----- category sections ----- */
	.category + .category {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-rule);
	}

	/* Desktop: heading on the left, spec list on the right, so the specs
	   add no height above the grid. */
	.category__header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		margin-bottom: var(--space-3);
	}

	.category__title {
		margin: 0;
	}

	.specs {
		margin: 0;
		padding: 0 0 0 var(--space-2);
		border-left: 2px solid var(--color-rule);
		max-width: 52ch;
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

	/* Mobile: keep label + value on one row (not stacked) and tighten the
	   type, so three rows cost ~6 short lines and the first product still
	   shows above the fold. */
	@media (max-width: 600px) {
		/* The global .section padding (6rem) alone would push the grid
		   ~200px down before the screens heading even starts. */
		.section--intro {
			padding: var(--space-4) 0 var(--space-3);
		}

		.category__header {
			margin-bottom: var(--space-2);
		}

		.specs {
			gap: 0.2rem;
			padding-left: var(--space-1);
		}

		.specs__row {
			grid-template-columns: 4.25rem 1fr;
			gap: var(--space-1);
		}

		.specs dt {
			font-size: 0.65rem;
		}

		.specs dd {
			font-size: 0.78rem;
			line-height: 1.4;
			color: var(--color-ink-soft);
		}
	}

	/* ----- grid ----- */
	.product-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-4) var(--space-3);
	}

	.product {
		display: flex;
		flex-direction: column;
	}

	.product-cta {
		display: flex;
		justify-content: center;
		margin-top: 0.25rem;
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

	/* Same 4:5 box as ProductCard so the swap-in doesn't shift layout. */
	.skeleton-image {
		aspect-ratio: 4 / 5;
	}

	.skeleton-body {
		padding: var(--space-2) 0 0;
		display: flex;
		flex-direction: column;
		align-items: center;
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

	.skeleton-line--price {
		height: 0.9rem;
		width: 35%;
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

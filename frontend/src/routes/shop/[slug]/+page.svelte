<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';
	import { isScreen, pickRelatedProducts } from '$lib/productGroups';
	import ProductCard from '$lib/ProductCard.svelte';
	import { reveal } from '$lib/reveal';
	import { cart } from '$lib/cartStore.svelte';
	import Button from '$lib/Button.svelte';
	import ErrorState from '$lib/ErrorState.svelte';

	const apiUrl = PUBLIC_API_URL;

	let product: Product | null = null;
	let loading = true;
	let notFound = false;
	let error: string | null = null;
	let activePhotoIndex = 0;

	$: slug = page.params.slug ?? '';
	// Frame/Canvas specs and the 3-week lead time are facts about the
	// folding screens only.
	$: screen = product ? isScreen(product) : false;
	$: fallbackDescription = product
		? `${product.name} — ${screen ? 'a handcrafted folding screen' : 'a cushion cover'} by Meryl Green Designs.`
		: '';

	function addToCart() {
		if (!product) return;
		cart.add(product);
	}

	// Keyed on the slug rather than run once in onMount: SvelteKit reuses
	// this component when navigating product → product (e.g. from the
	// "You may also like" strip), so a mount-only fetch would leave the
	// previous product on screen. `requestId` drops stale responses.
	let requestId = 0;
	async function loadProduct(currentSlug: string) {
		const id = ++requestId;
		loading = true;
		notFound = false;
		error = null;
		product = null;
		activePhotoIndex = 0;
		try {
			const res = await fetch(`${apiUrl}/products/${encodeURIComponent(currentSlug)}`);
			if (id !== requestId) return;
			if (res.status === 404) {
				notFound = true;
				return;
			}
			if (!res.ok) {
				error = 'Could not load this product. Please try again.';
				return;
			}
			const body = (await res.json()) as { product?: Product };
			if (id !== requestId) return;
			product = body.product ?? null;
			if (!product) notFound = true;
		} catch (e) {
			if (id !== requestId) return;
			console.error('Failed to fetch product', e);
			error = 'Could not reach the server. Please try again.';
		} finally {
			if (id === requestId) loading = false;
		}
	}

	$: loadProduct(slug);

	// "You may also like": the full list is fetched once, in parallel
	// with the product. Silent no-op on failure, like the home page —
	// the product page is complete without it.
	let allProducts: Product[] = [];
	$: related = product ? pickRelatedProducts(allProducts, product, 3) : [];

	onMount(async () => {
		try {
			const res = await fetch(`${apiUrl}/products`);
			if (!res.ok) return;
			const body = (await res.json()) as { products?: Product[] };
			allProducts = body.products ?? [];
		} catch {
			/* ignore */
		}
	});
</script>

<svelte:head>
	{#if product}
		<title>{product.name} — Meryl Green Designs</title>
		<meta name="description" content={product.blurb ?? fallbackDescription} />
	{:else if notFound}
		<title>Product not found — Meryl Green Designs</title>
		<!-- CloudFront serves this SPA shell with HTTP 200, so keep dead
		     slugs out of search results the same way +error.svelte does. -->
		<meta name="robots" content="noindex" />
	{:else}
		<title>Shop — Meryl Green Designs</title>
	{/if}
</svelte:head>

<section class="section">
	<div class="container">
		<nav class="breadcrumbs" aria-label="Breadcrumb">
			<a href="/shop">Shop</a>
			<span aria-hidden="true">/</span>
			<span class="breadcrumbs__current">
				{#if product}{product.name}{:else}&hellip;{/if}
			</span>
		</nav>

		{#if loading}
			<div class="product-detail product-detail--skeleton" aria-busy="true">
				<div class="gallery">
					<div class="gallery__main skeleton-shimmer"></div>
				</div>
				<div class="info">
					<div class="skeleton-line skeleton-line--title"></div>
					<div class="skeleton-line skeleton-line--sm"></div>
					<div class="skeleton-line skeleton-line--sm"></div>
				</div>
			</div>
		{:else if notFound}
			<!-- Same branded dead-end block as the root +error.svelte page. -->
			<div class="not-found">
				<ErrorState eyebrow="Shop" heading="Product not found">
					<p>
						This product isn't available — it may have been removed or renamed.
						Have a look at what's currently in the shop.
					</p>
					{#snippet actions()}
						<Button href="/shop">Browse the shop</Button>
						<Button href="/" variant="outlined">Back to home</Button>
					{/snippet}
				</ErrorState>
			</div>
		{:else if error}
			<div class="alert alert--error">{error}</div>
		{:else if product}
			<div class="product-detail">
				<div class="gallery">
					{#if product.photos && product.photos.length > 0}
						{@const main = imageUrl(product.photos[activePhotoIndex], 1200)}
						{#if main}
							<img class="gallery__main" src={main} alt={product.photos[activePhotoIndex].alt ?? product.name} />
						{/if}
						{#if product.photos.length > 1}
							<div class="gallery__thumbs" role="tablist" aria-label="Product photos">
								{#each product.photos as p, i (p._key)}
									{@const thumb = imageUrl(p, 200)}
									{#if thumb}
										<button
											type="button"
											class="gallery__thumb"
											class:is-active={i === activePhotoIndex}
											on:click={() => (activePhotoIndex = i)}
											role="tab"
											aria-selected={i === activePhotoIndex}
											aria-label={`View photo ${i + 1}`}
										>
											<img src={thumb} alt="" loading="lazy" />
										</button>
									{/if}
								{/each}
							</div>
						{/if}
					{:else}
						<div class="gallery__placeholder">No photo</div>
					{/if}
				</div>

				<div class="info">
					<h1>{product.name}</h1>

					{#if product.blurb}
						<p class="info__blurb">{product.blurb}</p>
					{/if}

					<p class="info__price">{formatPrice(product.priceZar)}</p>

					{#if product.dimensions}
						<dl class="info__meta">
							<dt>Dimensions</dt>
							<dd>{product.dimensions}</dd>
						</dl>
					{/if}

					<div class="info__cta">
						<Button variant="primary" on:click={addToCart} disabled={!product.priceZar}>
							Add to order
						</Button>
						<a class="info__back" href="/shop">← Back to shop</a>
					</div>
					{#if screen}
						<p class="info__lead-time">
							Made to order — typically 3 weeks from payment to dispatch.
						</p>
					{:else}
						<!-- No "made to order" claim for cushion covers until Meryl
						     confirms it (it affects the ECT Act s44 exemption). -->
						<p class="info__lead-time">
							Typically 3 weeks from payment to dispatch.
						</p>
					{/if}

					{#if product.description?.trim()}
						<div class="info__description">
							<h2>About this piece</h2>
							<p>{product.description}</p>
						</div>
					{/if}

					{#if screen}
						<div class="info__materials">
							<dl>
								<div class="info__materials-row">
									<dt>Frame</dt>
									<dd>Meranti hardwood, finished with a traditional teak stain</dd>
								</div>
								<div class="info__materials-row">
									<dt>Canvas</dt>
									<dd>100% cotton, digitally printed with a protective colour-fast coating</dd>
								</div>
							</dl>
						</div>
					{:else}
						<!-- TODO(Meryl): cushion cover specs -->
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>

{#if product && related.length > 0}
	<section class="section related" aria-labelledby="related-title">
		<div class="container" use:reveal>
			<h2 id="related-title">You may also like</h2>
			<div class="related__grid">
				{#each related as item (item._id)}
					<ProductCard product={item} imageWidth={480} hoverReveal={false} />
				{/each}
			</div>
		</div>
	</section>
{/if}

<style>
	.breadcrumbs {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-soft);
		margin-bottom: var(--space-3);
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.breadcrumbs a {
		color: var(--color-ink-soft);
		border-bottom: none;
	}

	.breadcrumbs a:hover {
		color: var(--color-bark);
	}

	.breadcrumbs__current {
		color: var(--color-ink);
	}

	.product-detail {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}

	@media (max-width: 800px) {
		.product-detail {
			grid-template-columns: 1fr;
			gap: var(--space-3);
		}
	}

	.gallery__main {
		width: 100%;
		/* 4:5 matches the shop cards and fits tall three-panel screens
		   (a square crop cut off their legs). */
		aspect-ratio: 4 / 5;
		object-fit: cover;
		background: var(--color-surface);
		display: block;
	}

	.gallery__placeholder {
		width: 100%;
		aspect-ratio: 4 / 5;
		background: repeating-linear-gradient(
			45deg,
			#e3e6da 0 16px,
			#d8dccd 16px 32px
		);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-ink-soft);
		font-style: italic;
	}

	.gallery__thumbs {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.gallery__thumb {
		width: 72px;
		height: 72px;
		padding: 0;
		border: 1px solid var(--color-rule);
		background: var(--color-surface);
		cursor: pointer;
		overflow: hidden;
		transition: border-color 150ms ease;
	}

	.gallery__thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.gallery__thumb:hover {
		border-color: var(--color-bark);
	}

	.gallery__thumb.is-active {
		border-color: var(--color-leaf-dark);
		outline: 1px solid var(--color-leaf-dark);
	}

	.info h1 {
		font-size: clamp(1.8rem, 3.5vw, 2.5rem);
		margin: 0 0 var(--space-2);
	}

	.info__blurb {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--color-ink-soft);
		margin: 0 0 var(--space-2);
	}

	.info__price {
		font-family: var(--font-display);
		font-size: 1.4rem;
		color: var(--color-bark);
		margin: 0 0 var(--space-3);
	}

	.info__meta {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		gap: 0.5rem var(--space-2);
		padding: var(--space-2) 0;
		margin: 0 0 var(--space-2);
		border-top: 1px solid var(--color-rule);
		border-bottom: 1px solid var(--color-rule);
	}

	.info__meta dt {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-bark);
		margin: 0;
	}

	.info__meta dd {
		margin: 0;
		color: var(--color-ink);
	}

	.info__cta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
		flex-wrap: wrap;
	}

	.info__lead-time {
		margin: 0 0 var(--space-3);
		font-size: 0.85rem;
		font-style: italic;
		color: var(--color-ink-soft);
	}

	.info__back {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-soft);
		border-bottom: none;
	}

	.info__back:hover {
		color: var(--color-bark);
	}

	.info__description {
		margin-bottom: var(--space-3);
	}

	.info__description h2 {
		font-size: 1.1rem;
		margin: 0 0 var(--space-1);
	}

	.info__description p {
		margin: 0;
		line-height: 1.75;
		white-space: pre-line;
		color: var(--color-ink);
	}

	.info__materials {
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-rule);
	}

	.info__materials dl {
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	.info__materials-row {
		display: grid;
		grid-template-columns: 5rem 1fr;
		gap: var(--space-2);
	}

	.info__materials dt {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-soft);
	}

	.info__materials dd {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		line-height: 1.5;
	}

	/* Skeleton */
	.product-detail--skeleton .gallery__main {
		background: linear-gradient(90deg, #e3e6da 0%, #f2f4ea 50%, #e3e6da 100%);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.4s infinite linear;
	}

	.skeleton-shimmer,
	.skeleton-line {
		background: linear-gradient(90deg, #e3e6da 0%, #f2f4ea 50%, #e3e6da 100%);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.4s infinite linear;
	}

	.skeleton-line {
		height: 0.9rem;
		border-radius: 2px;
		margin-bottom: 0.5rem;
	}

	.skeleton-line--title {
		height: 1.8rem;
		width: 70%;
	}

	.skeleton-line--sm {
		width: 90%;
	}

	@keyframes skeleton-shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* The detail section above already supplies the gap. */
	.related {
		padding-top: 0;
	}

	.related h2 {
		margin-bottom: var(--space-3);
	}

	.related__grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-4) var(--space-3);
	}

	@media (max-width: 800px) {
		.related__grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--space-3) var(--space-2);
		}
	}

	.not-found {
		padding: var(--space-3) 0 var(--space-2);
	}

	.alert {
		padding: var(--space-3);
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-left: 4px solid var(--color-leaf);
	}

	.alert--error {
		background: #f5e3e0;
		border-left-color: #a2432f;
		color: #6b2a1b;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';
	import { cart } from '$lib/cartStore.svelte';
	import Button from '$lib/Button.svelte';

	const apiUrl = PUBLIC_API_URL;

	let product: Product | null = null;
	let loading = true;
	let notFound = false;
	let error: string | null = null;
	let activePhotoIndex = 0;

	$: slug = page.params.slug ?? '';

	function addToCart() {
		if (!product) return;
		cart.add(product);
	}

	onMount(async () => {
		try {
			const res = await fetch(`${apiUrl}/products/${encodeURIComponent(slug)}`);
			if (res.status === 404) {
				notFound = true;
				return;
			}
			if (!res.ok) {
				error = 'Could not load this product. Please try again.';
				return;
			}
			const body = (await res.json()) as { product?: Product };
			product = body.product ?? null;
			if (!product) notFound = true;
		} catch (e) {
			console.error('Failed to fetch product', e);
			error = 'Could not reach the server. Please try again.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	{#if product}
		<title>{product.name} — Meryl Green Designs</title>
		<meta name="description" content={product.blurb ?? `${product.name} — a handcrafted screen by Meryl Green Designs.`} />
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
			<div class="alert">
				<h1>Product not found</h1>
				<p>
					This product isn't available — it may have been removed or renamed.
					<a href="/shop">Browse the shop</a> for what's currently available.
				</p>
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
						<Button variant="primary" on:click={addToCart} disabled={product.priceZar == null}>
							Add to order
						</Button>
						<a class="info__back" href="/shop">← Back to shop</a>
					</div>

					{#if product.description?.trim()}
						<div class="info__description">
							<h2>About this piece</h2>
							<p>{product.description}</p>
						</div>
					{/if}

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
				</div>
			</div>
		{/if}
	</div>
</section>

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
		aspect-ratio: 1 / 1;
		object-fit: cover;
		background: var(--color-surface);
		display: block;
	}

	.gallery__placeholder {
		width: 100%;
		aspect-ratio: 1 / 1;
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
		margin-bottom: var(--space-3);
		flex-wrap: wrap;
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

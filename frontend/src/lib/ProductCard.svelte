<!--
	Image-led product card: photo, name, optional dimensions, price, the
	whole block linking to /shop/<slug>. Shared by the shop grid and the
	home page "Featured pieces" strip so both use the same 4:5 crop and
	type treatment. Actions (e.g. "Add to order") sit OUTSIDE this
	component — the caller renders them after it, so a button is never
	nested inside the anchor.

	4:5 rather than square: the folding screens are taller than they are
	wide, and a square crop cut their legs off. Cushion covers (square)
	lose a sliver top and bottom instead, which reads fine.
-->
<script lang="ts">
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';

	export let product: Product;
	/** Requested image width in px. Cards render at ~260–360px, so 640 covers 2x DPR. */
	export let imageWidth = 640;
	/** Cross-fade to the second photo on hover/focus when there is one. */
	export let hoverReveal = true;
	/** Heading level for the product name, so the card fits the page outline. */
	export let headingTag: 'h2' | 'h3' = 'h3';

	$: photo = product.photos?.[0] ? imageUrl(product.photos[0], imageWidth) : null;
	$: hover = hoverReveal && product.photos?.[1] ? imageUrl(product.photos[1], imageWidth) : null;
</script>

<a class="card" href="/shop/{product.slug}" aria-label="View {product.name}">
	{#if photo}
		<div class="card__media">
			<img
				class="card__img card__img--primary"
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
					class="card__img card__img--secondary"
					src={hover}
					alt={product.photos?.[1]?.alt ?? product.name}
					aria-hidden="true"
				/>
			{/if}
		</div>
	{:else}
		<div class="card__media card__media--placeholder">Product photo</div>
	{/if}
	<div class="card__body">
		<svelte:element this={headingTag} class="card__name">{product.name}</svelte:element>
		{#if product.dimensions}
			<p class="card__dimensions">{product.dimensions}</p>
		{/if}
		<p class="card__price">{formatPrice(product.priceZar)}</p>
	</div>
</a>

<style>
	/* Edge-to-edge tile: no card chrome, no border, no shadow. The image
	   IS the tile visual. Text sits directly on the page backdrop. */
	.card {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		border-bottom: none;
	}

	.card:hover {
		color: inherit;
		border-bottom: none;
	}

	.card__media {
		position: relative;
		aspect-ratio: 4 / 5;
		overflow: hidden;
	}

	.card__media--placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-linear-gradient(45deg, #e3e6da 0 16px, #d8dccd 16px 32px);
		color: var(--color-ink-soft);
		font-family: var(--font-display);
		font-style: italic;
	}

	/* Subtle cream under the photo so transparent PNG uploads read as a
	   white-backed studio shot; real lifestyle photography hides it. */
	.card__img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: var(--color-surface);
		transition: opacity 280ms ease;
	}

	.card__img--secondary {
		opacity: 0;
	}

	/* `:has(...)` guards the primary fade-out so single-photo tiles don't
	   flash on hover. */
	.card:hover .card__img--secondary,
	.card:focus-visible .card__img--secondary {
		opacity: 1;
	}

	.card:hover .card__media:has(.card__img--secondary) .card__img--primary,
	.card:focus-visible .card__media:has(.card__img--secondary) .card__img--primary {
		opacity: 0;
	}

	/* Touch devices get no hover reveal — show only the primary. */
	@media (hover: none) {
		.card__img--secondary {
			display: none;
		}
	}

	.card__body {
		padding: var(--space-2) 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
		min-height: 0;
		text-align: center;
	}

	.card__name {
		margin: 0;
		font-size: 1rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-ink);
		font-family: var(--font-body);
		font-weight: 500;
	}

	.card__dimensions {
		margin: 0;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-soft);
	}

	.card__price {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 500;
		color: var(--color-bark);
		letter-spacing: 0.02em;
	}
</style>

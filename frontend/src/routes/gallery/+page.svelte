<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { imageUrl, type GalleryPhoto } from '$lib/sanity';
	import Button from '$lib/Button.svelte';

	const apiUrl = PUBLIC_API_URL;

	let photos: GalleryPhoto[] = [];
	let photosLoading = true;
	let photosError: string | null = null;
	const skeletonCount = 8;

	let lightboxIndex: number | null = null;

	function openLightbox(index: number) {
		lightboxIndex = index;
	}

	function closeLightbox() {
		lightboxIndex = null;
	}

	function showPrev() {
		if (lightboxIndex === null) return;
		lightboxIndex = (lightboxIndex - 1 + photos.length) % photos.length;
	}

	function showNext() {
		if (lightboxIndex === null) return;
		lightboxIndex = (lightboxIndex + 1) % photos.length;
	}

	function onKeydown(e: KeyboardEvent) {
		if (lightboxIndex === null) return;
		if (e.key === 'Escape') closeLightbox();
		else if (e.key === 'ArrowLeft') showPrev();
		else if (e.key === 'ArrowRight') showNext();
	}

	// Sanity asset refs embed dimensions: `image-{id}-{W}x{H}-{ext}`.
	// Parsing the ref avoids a backend change to project metadata.dimensions.
	function aspect(photo: GalleryPhoto): number {
		const ref = photo.image?.asset?._ref ?? '';
		const match = ref.match(/-(\d+)x(\d+)-/);
		if (match) {
			const w = Number(match[1]);
			const h = Number(match[2]);
			if (w > 0 && h > 0) return w / h;
		}
		return 4 / 3;
	}

	onMount(async () => {
		try {
			const res = await fetch(`${apiUrl}/gallery`);
			if (!res.ok) {
				photosError = 'Could not load photographs right now. Please refresh to try again.';
				return;
			}
			const body = (await res.json()) as { photos?: GalleryPhoto[] };
			photos = body.photos ?? [];
		} catch (e) {
			console.error('Failed to fetch gallery photos', e);
			photosError = 'Could not load photographs right now. Please refresh to try again.';
		} finally {
			photosLoading = false;
		}
	});
</script>

<svelte:window on:keydown={onKeydown} />

<svelte:head>
	<title>Gallery — Meryl Green Designs</title>
	<meta
		name="description"
		content="Examples of styles and finishes you can commission from Meryl Green Designs — handcrafted screens adjusted to your space."
	/>
	<meta property="og:title" content="Gallery — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Examples of styles and finishes you can commission from Meryl Green Designs — handcrafted screens adjusted to your space."
	/>
</svelte:head>

<section class="section section--intro">
	<div class="container">
		<p class="eyebrow">Gallery</p>
		<h1>Styles you can commission</h1>
		<p class="lede">
			Each photograph is an example of a style or finish that can be made for you.
			Dimensions, wood and colour can be adjusted to suit your space — get in touch
			with the size you need and a few words about where it will go.
		</p>
	</div>
</section>

<section class="gallery-section">
	<div class="container">
		{#if photosLoading}
			<div class="photo-wall" aria-busy="true" aria-label="Loading photographs">
				{#each Array(skeletonCount) as _, i (i)}
					<figure
						class="tile tile--skeleton"
						aria-hidden="true"
						style="aspect-ratio: {i % 2 === 0 ? '4 / 3' : '3 / 4'}"
					>
						<div class="tile-image skeleton-shimmer"></div>
					</figure>
				{/each}
			</div>
		{:else if photosError}
			<div class="alert alert--error">{photosError}</div>
		{:else if photos.length === 0}
			<div class="empty">
				<p>No photographs yet.</p>
			</div>
		{:else}
			<div class="photo-wall">
				{#each photos as photo, i (photo._id)}
					{@const src = imageUrl(photo.image, 800)}
					{@const ar = aspect(photo)}
					<figure class="tile" style="flex-basis: {Math.max(220, Math.min(480, ar * 320))}px; aspect-ratio: {ar}">
						{#if src}
							<button
								type="button"
								class="tile-button"
								on:click={() => openLightbox(i)}
								aria-label={photo.caption ?? photo.image.alt ?? 'Enlarge photograph'}
							>
								<img
									class="tile-image"
									{src}
									alt={photo.image.alt ?? photo.caption ?? 'Gallery photograph'}
									loading="lazy"
								/>
							</button>
						{:else}
							<div class="tile-image tile-image--placeholder">Photo</div>
						{/if}
						{#if photo.caption}
							<figcaption>{photo.caption}</figcaption>
						{/if}
					</figure>
				{/each}
			</div>
		{/if}
	</div>
</section>

{#if !photosLoading && !photosError && photos.length > 0}
	<section class="commission-cta">
		<div class="container">
			<h2>See something you'd like for your space?</h2>
			<p>
				Each piece in this gallery can be commissioned in custom sizes,
				woods or finishes. Send a quick note about what you have in
				mind and we'll come back with a quote.
			</p>
			<Button href="/contact" variant="primary">Enquire about a commission</Button>
		</div>
	</section>
{/if}

{#if lightboxIndex !== null && photos[lightboxIndex]}
	{@const current = photos[lightboxIndex]}
	{@const fullSrc = imageUrl(current.image, 1800)}
	<div
		class="lightbox"
		role="dialog"
		aria-modal="true"
		aria-label={current.caption ?? current.image.alt ?? 'Photograph'}
		tabindex="-1"
		on:click|self={closeLightbox}
		on:keydown|self={(e) => e.key === 'Escape' && closeLightbox()}
	>
		<button class="lightbox-close" on:click={closeLightbox} aria-label="Close">×</button>
		{#if photos.length > 1}
			<button class="lightbox-nav lightbox-nav--prev" on:click={showPrev} aria-label="Previous photograph">‹</button>
			<button class="lightbox-nav lightbox-nav--next" on:click={showNext} aria-label="Next photograph">›</button>
		{/if}
		<figure class="lightbox-figure">
			{#if fullSrc}
				<img src={fullSrc} alt={current.image.alt ?? current.caption ?? 'Photograph'} />
			{/if}
			{#if current.caption}
				<figcaption>{current.caption}</figcaption>
			{/if}
			<a
				class="lightbox-enquire"
				href="/contact?photo={encodeURIComponent(current.caption ?? current.image.alt ?? 'gallery photograph')}"
			>
				Enquire about this style →
			</a>
		</figure>
	</div>
{/if}

<style>
	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: 0;
	}

	/* Collapse the gap between intro and photo wall — no need for a full
	   section's worth of padding when the photos follow directly. */
	.section--intro {
		padding-bottom: var(--space-3);
	}

	.gallery-section {
		padding: 0 0 var(--space-6);
	}

	.commission-cta {
		padding: var(--space-5) 0 var(--space-6);
		text-align: center;
		border-top: 1px solid var(--color-rule);
	}

	.commission-cta h2 {
		margin: 0 0 var(--space-2);
	}

	.commission-cta p {
		max-width: 50ch;
		margin: 0 auto var(--space-3);
		color: var(--color-ink-soft);
	}

	/* Flex-wrap justified layout. Tiles don't grow to fill the row — they
	   sit at their natural basis size so 2 photos don't end up oversized,
	   and the container's natural padding does the work of centring. */
	.photo-wall {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-3);
	}

	.tile {
		margin: 0;
		flex-grow: 0;
		flex-shrink: 1;
		max-width: 100%;
		overflow: hidden;
		display: block;
		/* Soft cream surface so transparent-PNG uploads render on a
		   consistent background — hides the uneven cutout edges at the
		   bottom of the current screen photographs. Real lifestyle shots
		   cover the cream entirely. */
		background: var(--color-surface);
		box-shadow: 0 4px 16px rgba(20, 30, 15, 0.14);
	}

	.tile-button {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		margin: 0;
		border: none;
		background: none;
		cursor: zoom-in;
		overflow: hidden;
	}

	.tile-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 400ms ease;
	}

	.tile-button:hover .tile-image {
		transform: scale(1.03);
	}

	.tile-image--placeholder {
		aspect-ratio: 4 / 3;
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

	.tile figcaption {
		padding: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		text-align: center;
		font-style: italic;
	}

	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(12, 18, 10, 0.92);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: var(--space-3);
	}

	.lightbox-figure {
		margin: 0;
		max-width: min(100%, 1400px);
		max-height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
	}

	.lightbox-figure img {
		max-width: 100%;
		max-height: calc(100vh - 6rem);
		object-fit: contain;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.lightbox-figure figcaption {
		color: #e8ece1;
		font-size: 0.9rem;
		font-style: italic;
		text-align: center;
	}

	.lightbox-enquire {
		color: #f6f4ee;
		text-decoration: underline;
		text-underline-offset: 3px;
		font-size: 0.9rem;
	}

	.lightbox-enquire:hover,
	.lightbox-enquire:focus {
		color: #fff;
	}

	.lightbox-close,
	.lightbox-nav {
		position: absolute;
		background: none;
		border: none;
		color: #f6f4ee;
		cursor: pointer;
		line-height: 1;
		padding: 0.25rem 0.75rem;
	}

	.lightbox-close {
		top: var(--space-2);
		right: var(--space-2);
		font-size: 2.5rem;
	}

	.lightbox-nav {
		top: 50%;
		transform: translateY(-50%);
		font-size: 3.5rem;
	}

	@media (max-width: 520px) {
		.lightbox-nav {
			font-size: 2.5rem;
		}
		.lightbox-close {
			font-size: 2rem;
		}
	}

	.lightbox-nav--prev {
		left: var(--space-2);
	}

	.lightbox-nav--next {
		right: var(--space-2);
	}

	.lightbox-close:hover,
	.lightbox-nav:hover {
		color: #fff;
	}

	.empty {
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px dashed var(--color-rule);
		text-align: center;
		color: var(--color-ink-soft);
		font-style: italic;
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

	/* ----- skeleton loading state ----- */
	.tile--skeleton {
		pointer-events: none;
	}

	.skeleton-shimmer {
		background: linear-gradient(
			90deg,
			#e3e6da 0%,
			#f2f4ea 50%,
			#e3e6da 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.4s infinite linear;
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
		.skeleton-shimmer {
			animation: none;
		}
	}
</style>

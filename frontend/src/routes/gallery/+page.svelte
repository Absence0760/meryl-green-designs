<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { imageUrl, type GalleryPhoto } from '$lib/sanity';
	import { isDemoMode, demoGalleryPhotos } from '$lib/demo';

	const apiUrl = PUBLIC_API_URL;

	// Demo builds skip the network fetch and seed the hardcoded gallery.
	let photos: GalleryPhoto[] = isDemoMode ? demoGalleryPhotos : [];
	let photosLoading = !isDemoMode;
	let photosError: string | null = null;
	const skeletonCount = 8;

	onMount(async () => {
		if (isDemoMode) return;
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

<svelte:head>
	<title>Gallery — Meryl Green Designs</title>
	<meta
		name="description"
		content="Photographs of screens, finishes and bespoke options from Meryl Green Designs."
	/>
	<meta property="og:title" content="Gallery — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Photographs of screens, finishes and bespoke options from Meryl Green Designs."
	/>
</svelte:head>

<section class="section">
	<div class="container">
		<p class="eyebrow">Gallery</p>
		<h1>Screens &amp; design options</h1>
		<p class="lede">
			A growing collection of photographs showing the different screens, finishes and bespoke
			options available. More images are being added — please check back soon.
		</p>
	</div>
</section>

<section class="backdrop" style="background-image: url('/landscape.JPG')">
	<div class="container">
		{#if photosLoading}
			<div class="gallery-grid" aria-busy="true" aria-label="Loading photographs">
				{#each Array(skeletonCount) as _, i (i)}
					<figure class="tile tile--skeleton" aria-hidden="true">
						<div class="tile-image skeleton-shimmer"></div>
					</figure>
				{/each}
			</div>
		{:else if photosError}
			<div class="alert alert--error">{photosError}</div>
		{:else if photos.length === 0}
			<div class="empty">
				<p>
					No photographs yet.
				</p>
			</div>
		{:else}
			<div class="gallery-grid">
				{#each photos as photo (photo._id)}
					{@const src = imageUrl(photo.image, 640)}
					<figure class="tile">
						{#if src}
							<img
								class="tile-image tile-image--photo"
								{src}
								alt={photo.image.alt ?? photo.caption ?? 'Gallery photograph'}
								loading="lazy"
							/>
						{:else}
							<div class="tile-image">Photo</div>
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

	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-2);
	}

	.tile {
		margin: 0;
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}

	.tile-image {
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

	.tile-image--photo {
		object-fit: cover;
		width: 100%;
		height: 100%;
		background: none;
	}

	.tile figcaption {
		padding: 0.75rem var(--space-2);
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		border-top: 1px solid var(--color-rule);
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

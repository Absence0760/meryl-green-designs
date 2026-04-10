<script lang="ts">
	import { imageUrl } from '$lib/sanity';
	import type { PageData } from './$types';

	export let data: PageData;

	$: photos = data.photos;
</script>

<section class="section">
	<div class="container">
		<p class="eyebrow">Gallery</p>
		<h1>Screens &amp; design options</h1>
		<p class="lede">
			A growing collection of photographs showing the different screens, finishes and bespoke
			options available. More images are being added — please check back soon.
		</p>

		{#if photos.length === 0}
			<div class="empty">
				<p>
					No photographs yet.
				</p>
			</div>
		{:else}
			<div class="gallery-grid">
				{#each photos as photo (photo._id)}
					{@const src = imageUrl(photo.image, 800)}
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
		margin-bottom: var(--space-4);
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
		/* Real photos: fill the tile area, crop to keep the aspect-ratio
		   consistent across tiles regardless of the source image's shape. */
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
</style>

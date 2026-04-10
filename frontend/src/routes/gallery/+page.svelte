<script lang="ts">
	// TODO: replace with real gallery photographs.
	const placeholders = Array.from({ length: 8 }, (_, i) => i + 1);
</script>

<section class="section">
	<div class="container">
		<p class="eyebrow">Gallery</p>
		<h1>Screens &amp; design options</h1>
		<p class="lede">
			A growing collection of photographs showing the different screens, finishes and bespoke
			options available. More images are being added — please check back soon.
		</p>

		<div class="gallery-grid">
			{#each placeholders as n}
				<figure class="tile">
					<div class="tile-image">Photo {n}</div>
					<figcaption>Placeholder caption</figcaption>
				</figure>
			{/each}
		</div>
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

	.tile figcaption {
		padding: 0.75rem var(--space-2);
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		border-top: 1px solid var(--color-rule);
	}
</style>

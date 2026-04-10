<script lang="ts">
	// TODO: replace with real hero photograph once supplied.
	const heroImage = '';
</script>

<section class="hero" style={heroImage ? `background-image: url(${heroImage})` : ''}>
	<div class="hero-overlay">
		<div class="container">
			<p class="eyebrow">The Green Collection</p>
			<h1>Inspired by Nature</h1>
			<p class="tagline">Handcrafted screens &amp; designs drawn from the living world.</p>
		</div>
	</div>
</section>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Our Story</p>
		<h2>A little about the collection</h2>
		<!-- TODO: replace with the real story copy supplied by Meryl. -->
		<p class="placeholder">
			[Story goes here. This paragraph is a placeholder until the final copy is provided. It will
			introduce the collection, the inspiration behind it, and the maker.]
		</p>
	</div>
</section>

<section class="section section--alt">
	<div class="container narrow">
		<p class="eyebrow">A Poem</p>
		<!-- TODO: replace with the real poem once supplied. -->
		<blockquote class="poem placeholder">
			[Poem goes here.]<br />
			[Line two of the poem.]<br />
			[Line three of the poem.]<br />
			[Line four of the poem.]
		</blockquote>
	</div>
</section>

<section class="section">
	<div class="container">
		<div class="cta-grid">
			<a class="cta-card" href="/gallery">
				<h3>Gallery</h3>
				<p>Browse photographs of screens and design options.</p>
				<span class="cta-link">View gallery →</span>
			</a>
			<a class="cta-card" href="/shop">
				<h3>Shop</h3>
				<p>Finished products available for purchase.</p>
				<span class="cta-link">Visit shop →</span>
			</a>
		</div>
	</div>
</section>

<style>
	.hero {
		min-height: 72vh;
		background-color: #c8d1b9;
		background-size: cover;
		background-position: center;
		display: flex;
		align-items: flex-end;
		color: #f6f4ee;
		position: relative;
	}

	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			135deg,
			rgba(74, 107, 58, 0.18) 0 12px,
			rgba(47, 74, 37, 0.18) 12px 24px
		);
		pointer-events: none;
	}

	.hero-overlay {
		position: relative;
		width: 100%;
		padding: var(--space-5) 0;
		background: linear-gradient(to top, rgba(20, 30, 15, 0.72), rgba(20, 30, 15, 0));
	}

	.hero :global(h1) {
		color: #f6f4ee;
	}

	.hero .eyebrow {
		color: #cfd6bf;
	}

	.tagline {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.25rem;
		max-width: 40ch;
		margin: 0;
	}

	.narrow {
		max-width: 680px;
	}

	.placeholder {
		color: var(--color-ink-soft);
		font-style: italic;
	}

	.poem {
		font-family: var(--font-display);
		font-size: 1.25rem;
		line-height: 1.8;
		margin: 0;
		padding-left: var(--space-3);
		border-left: 3px solid var(--color-leaf);
	}

	.cta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-3);
	}

	.cta-card {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
		padding: var(--space-4);
		color: var(--color-ink);
		border-bottom: 1px solid var(--color-rule);
		transition:
			transform 180ms ease,
			box-shadow 180ms ease;
	}

	.cta-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 30px rgba(47, 74, 37, 0.12);
		border-color: var(--color-leaf);
	}

	.cta-card h3 {
		margin: 0 0 var(--space-1);
	}

	.cta-card p {
		margin: 0 0 var(--space-2);
		color: var(--color-ink-soft);
	}

	.cta-link {
		font-size: 0.9rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-leaf-dark);
	}
</style>

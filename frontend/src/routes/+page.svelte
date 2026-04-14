<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { imageUrl, type GalleryPhoto } from '$lib/sanity';

	const heroImage = `${base}/two_trees.JPG`;
	const apiUrl = PUBLIC_API_URL;

	let featured: GalleryPhoto[] = [];

	onMount(async () => {
		try {
			const res = await fetch(`${apiUrl}/gallery`);
			if (!res.ok) return;
			const body = (await res.json()) as { photos?: GalleryPhoto[] };
			featured = (body.photos ?? []).slice(0, 4);
		} catch {
			// Silent failure — the featured band just won't render.
			// The home page is already complete without it.
		}
	});

	const storyParagraphs: string[] = [
		'Bring a snapshot of beauty, peace and tranquility from a place where time stands still to a place where time seems to move too quickly. Let it infuse your everyday environment, be it your home, place of work or any other space of your choice.',
		'Let the sounds and calls of the African bush envelope your senses and take you on a journey of deep inner reflection, where everything seems right in the world; a meditative state of deep healing, that only nature can provide.',
		'It all started more than 10 years ago in a very special place in the African bush, where I fell in love with the perfection, simplicity and vibrancy of the natural world. Using my very simple but exceptional camera, I began a journey capturing the \u2018Big 5\u2019, antelope, smaller creatures, beautiful birds, plant life and unforgettable \u2018bush sunsets\u2019.'
	];

	const poemTitle = 'Africa';
	const poemAuthor = 'Author unknown';
	// Verses stored as an array so each one can be rendered as its own
	// stanza with blank lines between. Lines inside a stanza are joined
	// with newlines and rendered via `white-space: pre-line`.
	const poemStanzas: string[][] = [
		[
			'When you have acquired a taste for the dust,',
			'And the scent of our first rain,',
			'You’re hooked for life on Africa,',
			'And you’ll not be right again.',
			'Until you can watch the setting moon',
			'And hear the jackals bark,',
			'And know they are around you',
			'Waiting in the dark.'
		],
		[
			'When you long to see the elephants',
			'Or hear the coucal’s song,',
			'When the moonrise sets your blood on fire,',
			'Then you’ve been away too long.',
			'It is time to cut the traces loose,',
			'And let your heart go free,',
			'',
			'Beyond that far horizon',
			'Where your spirit yearns to be.'
		],
		[
			'Africa is waiting – come!',
			'Since you have touched the open sky',
			'And learned to love the rustling grass',
			'And the wild fish eagle’s cry.',
			'You’ll always hunger for the bush;',
			'For the lion’s rasping roar,',
			'To camp at last beneath the stars',
			'And to be at peace once more.'
		]
	];
</script>

<section class="hero" style={heroImage ? `background-image: url(${heroImage})` : ''}>
	<div class="hero-overlay">
		<div class="container">
			<h1>Inspired by Nature</h1>
			<p class="tagline">
				Photographs of the African bush — printed on cotton canvas,
				framed in Meranti hardwood.
			</p>
			<div class="hero-cta">
				<a class="hero-btn hero-btn--primary" href="/shop">Shop the collection</a>
				<a class="hero-btn hero-btn--ghost" href="/gallery">View gallery</a>
			</div>
		</div>
	</div>
</section>

<svelte:head>
	<title>Meryl Green Designs — Inspired by Nature</title>
	<meta
		name="description"
		content="Handcrafted screens and designs from Meryl Green, inspired by the light, colour and stillness of the African bush."
	/>
	<meta property="og:title" content="Meryl Green Designs — Inspired by Nature" />
	<meta
		property="og:description"
		content="Handcrafted screens and designs from Meryl Green, inspired by the light, colour and stillness of the African bush."
	/>
	<link rel="preload" as="image" href={heroImage} />
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Our story</p>
		<h2>How it all began</h2>
		{#each storyParagraphs as paragraph}
			<p class="story-paragraph">{paragraph}</p>
		{/each}
	</div>
</section>

{#if featured.length > 0}
	<section class="featured-band" aria-label="Featured photographs">
		<div class="featured-band__grid">
			{#each featured as photo (photo._id)}
				{@const src = imageUrl(photo.image, 700)}
				{#if src}
					<a class="featured-band__tile" href="/gallery" aria-label={photo.caption ?? photo.image.alt ?? 'View gallery'}>
						<img src={src} alt={photo.image.alt ?? photo.caption ?? ''} loading="lazy" />
					</a>
				{/if}
			{/each}
		</div>
		<div class="container featured-band__footer">
			<a class="featured-band__link" href="/gallery">View the full gallery →</a>
		</div>
	</section>
{/if}

<section class="section section--alt">
	<div class="container narrow">
		<p class="eyebrow">A Poem</p>
		<h2 class="poem-title">{poemTitle}</h2>
		<blockquote class="poem">
			{#each poemStanzas as stanza, i}
				<p class="poem-stanza">{stanza.join('\n')}</p>
				{#if i < poemStanzas.length - 1}
					<span class="poem-break" aria-hidden="true"></span>
				{/if}
			{/each}
		</blockquote>
		<cite class="poem-author">— {poemAuthor}</cite>
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
		/* Gentle dark vignette that lifts text legibility on top of a real
		   photograph, without washing the image out. */
		background: linear-gradient(
			to bottom,
			rgba(20, 30, 15, 0.1) 0%,
			rgba(20, 30, 15, 0) 40%,
			rgba(20, 30, 15, 0) 100%
		);
		pointer-events: none;
	}

	.hero-overlay {
		position: relative;
		width: 100%;
		padding: var(--space-5) 0;
		background: linear-gradient(to top, rgba(20, 30, 15, 0.78), rgba(20, 30, 15, 0));
	}

	.hero :global(h1) {
		color: #f6f4ee;
	}

	.tagline {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.25rem;
		max-width: 40ch;
		margin: 0 0 var(--space-3);
	}

	.hero-cta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.hero-btn {
		display: inline-block;
		padding: 0.75rem 1.4rem;
		font-family: var(--font-body);
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
		border: 1px solid #f6f4ee;
		color: #f6f4ee;
		border-bottom: 1px solid #f6f4ee;
		transition:
			background-color 160ms ease,
			color 160ms ease,
			border-color 160ms ease;
	}

	.hero-btn--primary {
		background: #f6f4ee;
		color: var(--color-leaf-dark);
		border-color: #f6f4ee;
	}

	.hero-btn--primary:hover {
		background: var(--color-bark);
		color: #f6f4ee;
		border-color: var(--color-bark);
	}

	.hero-btn--ghost:hover {
		background: rgba(246, 244, 238, 0.12);
		color: #f6f4ee;
		border-color: #f6f4ee;
	}

	.narrow {
		max-width: 680px;
	}

	.placeholder {
		color: var(--color-ink-soft);
		font-style: italic;
	}

	.story-paragraph {
		margin: 0 0 var(--space-2);
		font-size: 1rem;
		line-height: 1.75;
		color: var(--color-ink);
	}

	.story-paragraph:last-child {
		margin-bottom: 0;
	}

	.poem-title {
		font-family: var(--font-display);
		font-size: 1.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0 0 var(--space-2);
		color: var(--color-leaf-dark);
	}

	.poem {
		font-family: var(--font-display);
		font-size: 1.15rem;
		line-height: 1.75;
		margin: 0;
		padding-left: var(--space-3);
		border-left: 3px solid var(--color-leaf);
	}

	.poem-stanza {
		/* Preserve line breaks supplied in the verse data so each line of a
		   stanza renders on its own row without needing <br> tags. */
		white-space: pre-line;
		margin: 0;
	}

	.poem-break {
		display: block;
		height: var(--space-2);
	}

	.poem-author {
		display: block;
		margin-top: var(--space-2);
		padding-left: var(--space-3);
		font-size: 0.9rem;
		color: var(--color-ink-soft);
		font-style: italic;
	}

	/* Full-bleed four-across photo band between the story and the poem.
	   Breaks up text-heavy home page, previews the gallery, and gives
	   the page visual rhythm between the two narrative sections. */
	.featured-band {
		padding: 0 0 var(--space-5);
	}

	.featured-band__grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2px;
	}

	@media (max-width: 720px) {
		.featured-band__grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.featured-band__tile {
		display: block;
		overflow: hidden;
		aspect-ratio: 1 / 1;
		border-bottom: none;
	}

	.featured-band__tile:hover {
		border-bottom: none;
	}

	.featured-band__tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 500ms ease;
	}

	.featured-band__tile:hover img {
		transform: scale(1.04);
	}

	.featured-band__footer {
		text-align: center;
		padding-top: var(--space-3);
	}

	.featured-band__link {
		font-size: 0.9rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-bark);
		font-weight: 500;
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
		color: var(--color-bark);
		font-weight: 500;
	}
</style>

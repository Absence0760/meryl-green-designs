<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { imageUrl, type GalleryPhoto, type Product, type Testimonial } from '$lib/sanity';
	import { pickFeaturedProducts } from '$lib/productGroups';
	import { HERO_SIZES, heroFallbackSrc, heroSrc, heroSrcset } from '$lib/heroImage';
	import Button from '$lib/Button.svelte';
	import ProductCard from '$lib/ProductCard.svelte';
	import SectionDivider from '$lib/SectionDivider.svelte';
	import { reveal } from '$lib/reveal';

	const heroFallback = heroFallbackSrc(base);
	const heroWebpSrcset = heroSrcset(base);
	const apiUrl = PUBLIC_API_URL;

	let featured: GalleryPhoto[] = [];
	let testimonials: Testimonial[] = [];
	let featuredProducts: Product[] = [];

	// Image-led CTA cards: a real product / gallery photo once the fetches
	// land, the hero photograph until then (or if they fail).
	const ctaFallback = heroSrc(800, base);
	$: shopCtaImage =
		(featuredProducts[0]?.photos?.[0] && imageUrl(featuredProducts[0].photos[0], 800)) ||
		ctaFallback;
	$: galleryCtaImage = (featured[0] && imageUrl(featured[0].image, 800)) || ctaFallback;

	onMount(async () => {
		// Fetch gallery + testimonials + products in parallel. All are silent
		// no-ops on failure — the home page is already complete without them.
		const [galleryRes, testimonialsRes, productsRes] = await Promise.allSettled([
			fetch(`${apiUrl}/gallery`),
			fetch(`${apiUrl}/testimonials`),
			fetch(`${apiUrl}/products`)
		]);

		if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
			try {
				const body = (await productsRes.value.json()) as { products?: Product[] };
				featuredProducts = pickFeaturedProducts(body.products ?? [], 4);
			} catch {
				/* ignore */
			}
		}

		if (galleryRes.status === 'fulfilled' && galleryRes.value.ok) {
			try {
				const body = (await galleryRes.value.json()) as { photos?: GalleryPhoto[] };
				featured = (body.photos ?? []).slice(0, 4);
			} catch {
				/* ignore */
			}
		}

		if (testimonialsRes.status === 'fulfilled' && testimonialsRes.value.ok) {
			try {
				const body = (await testimonialsRes.value.json()) as {
					testimonials?: Testimonial[];
				};
				testimonials = (body.testimonials ?? []).slice(0, 3);
			} catch {
				/* ignore */
			}
		}
	});

	const storyParagraphs: string[] = [
		'Bring a snapshot of beauty, peace and tranquility from a place where time stands still to a place where time seems to move too quickly. Let it infuse your everyday environment, be it your home, place of work or any other space of your choice.',
		'Let the sounds and calls of the African bush envelope your senses and take you on a journey of deep inner reflection, where everything seems right in the world; a meditative state of deep healing, that only nature can provide.',
		'It all started more than 10 years ago in a very special place in the African bush, where I fell in love with the perfection, simplicity and vibrancy of the natural world. Using my very simple but exceptional camera, I began a journey capturing the \u2018Big 5\u2019, antelope, smaller creatures, beautiful birds, plant life and unforgettable \u2018bush sunsets\u2019.'
	];

	const poemTitle = 'Africa';
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

<section class="hero">
	<!-- Decorative (alt=""): the H1 and tagline carry the meaning. WebP at
	     800/1280/1920w, JPG fallback for browsers without WebP. -->
	<picture>
		<source type="image/webp" srcset={heroWebpSrcset} sizes={HERO_SIZES} />
		<img
			class="hero-image"
			src={heroFallback}
			alt=""
			width="1920"
			height="1246"
			fetchpriority="high"
			decoding="async"
		/>
	</picture>
	<div class="hero-overlay">
		<div class="container">
			<h1>Inspired by Nature</h1>
			<p class="tagline">
				Photographs of the African bush — made into folding screens
				and cushion covers for your home.
			</p>
			<div class="hero-cta">
				<Button href="/shop" variant="ghost-primary">Shop the collection</Button>
				<Button href="/gallery" variant="ghost">View gallery</Button>
			</div>
		</div>
	</div>
</section>

<svelte:head>
	<title>Meryl Green Designs — Inspired by Nature</title>
	<meta
		name="description"
		content="Handcrafted folding screens and cushion covers from Meryl Green, inspired by the light, colour and stillness of the African bush."
	/>
	<meta property="og:title" content="Meryl Green Designs — Inspired by Nature" />
	<meta
		property="og:description"
		content="Handcrafted folding screens and cushion covers from Meryl Green, inspired by the light, colour and stillness of the African bush."
	/>
	<!-- Mirrors the <source> above so the browser preloads the same
	     candidate it will pick for the hero. -->
	<link
		rel="preload"
		as="image"
		type="image/webp"
		imagesrcset={heroWebpSrcset}
		imagesizes={HERO_SIZES}
		fetchpriority="high"
	/>
</svelte:head>

<section class="section">
	<div class="container narrow" use:reveal>
		<p class="eyebrow">Our story</p>
		<h2>How it all began</h2>
		{#each storyParagraphs as paragraph}
			<p class="story-paragraph">{paragraph}</p>
		{/each}
	</div>
</section>

<SectionDivider />

{#if featuredProducts.length > 0}
	<section class="section featured-pieces" aria-labelledby="featured-pieces-title">
		<div class="container" use:reveal>
			<div class="featured-pieces__header">
				<div>
					<p class="eyebrow">From the shop</p>
					<h2 id="featured-pieces-title">Featured pieces</h2>
				</div>
				<a class="featured-pieces__link" href="/shop">Visit the shop →</a>
			</div>
			<div class="featured-pieces__grid">
				{#each featuredProducts as product (product._id)}
					<ProductCard {product} imageWidth={480} hoverReveal={false} />
				{/each}
			</div>
		</div>
	</section>
{/if}

{#if testimonials.length > 0}
	<section class="section testimonials" aria-label="What customers are saying">
		<div class="container">
			<p class="eyebrow" use:reveal>In their words</p>
			<div class="testimonials__grid">
				{#each testimonials as t (t._id)}
					<blockquote class="testimonial">
						<p class="testimonial__quote">{t.quote}</p>
						<footer class="testimonial__author">
							— {t.author}{#if t.location}<span class="testimonial__loc">, {t.location}</span>{/if}
						</footer>
					</blockquote>
				{/each}
			</div>
		</div>
	</section>
{/if}

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
	<div class="container narrow" use:reveal>
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
	</div>
</section>

<SectionDivider />

<section class="section">
	<div class="container" use:reveal>
		<div class="cta-grid">
			<a class="cta-card" href="/gallery">
				<div class="cta-card__media">
					<img src={galleryCtaImage} alt="" loading="lazy" />
				</div>
				<div class="cta-card__body">
					<h3>Gallery</h3>
					<p>Browse photographs of screens and design options.</p>
					<span class="cta-link">View gallery →</span>
				</div>
			</a>
			<a class="cta-card" href="/shop">
				<div class="cta-card__media">
					<img src={shopCtaImage} alt="" loading="lazy" />
				</div>
				<div class="cta-card__body">
					<h3>Shop</h3>
					<p>Folding screens and cushion covers, ready to order.</p>
					<span class="cta-link">Visit shop →</span>
				</div>
			</a>
		</div>
	</div>
</section>

<style>
	/* The photo is an <img> (not a CSS background) so the browser can pick
	   a WebP width from srcset. Sage background-color shows until it loads. */
	.hero {
		min-height: 72vh;
		background-color: #c8d1b9;
		display: flex;
		align-items: flex-end;
		color: var(--color-bg);
		position: relative;
		overflow: hidden;
	}

	.hero-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
		/* One slow settle on load — the photo drifts from 6% zoom to rest. */
		animation: hero-settle 14s cubic-bezier(0.2, 0.6, 0.2, 1) both;
	}

	@keyframes hero-settle {
		from {
			transform: scale(1.06);
		}
		to {
			transform: scale(1);
		}
	}

	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
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
		z-index: 2;
		width: 100%;
		padding: var(--space-5) 0;
		background: linear-gradient(to top, rgba(20, 30, 15, 0.78), rgba(20, 30, 15, 0));
	}

	.hero :global(h1) {
		color: var(--color-bg);
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

	.narrow {
		max-width: 680px;
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

	/* ----- featured pieces (products) ----- */
	.featured-pieces {
		padding-top: 0;
	}

	.featured-pieces__header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		margin-bottom: var(--space-3);
	}

	.featured-pieces__header h2 {
		margin: 0;
	}

	.featured-pieces__link {
		font-size: 0.9rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-bark);
		font-weight: 500;
		border-bottom: none;
	}

	.featured-pieces__grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4) var(--space-3);
	}

	@media (max-width: 900px) {
		.featured-pieces__grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--space-3) var(--space-2);
		}
	}

	.testimonials {
		padding-bottom: var(--space-5);
		padding-top: var(--space-3);
	}

	.testimonials__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-2);
	}

	.testimonial {
		margin: 0;
		padding: var(--space-2) 0 0;
		border-top: 1px solid var(--color-rule);
	}

	.testimonial__quote {
		font-family: var(--font-display);
		font-size: 1.05rem;
		line-height: 1.7;
		color: var(--color-ink);
		margin: 0 0 var(--space-2);
		/* Subtle quote mark ornament. */
		position: relative;
	}

	.testimonial__quote::before {
		content: '\201C';
		font-family: var(--font-display);
		font-size: 3rem;
		line-height: 0.5;
		color: var(--color-bark);
		margin-right: 0.15rem;
		vertical-align: -0.6rem;
	}

	.testimonial__author {
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		letter-spacing: 0.04em;
	}

	.testimonial__loc {
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

	/* Image-led CTA cards: photo on top, text panel below. */
	.cta-card {
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
		overflow: hidden;
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

	.cta-card__media {
		aspect-ratio: 3 / 2;
		overflow: hidden;
		background: #c8d1b9;
	}

	.cta-card__media img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 500ms ease;
	}

	.cta-card:hover .cta-card__media img {
		transform: scale(1.04);
	}

	.cta-card__body {
		padding: var(--space-3) var(--space-4) var(--space-4);
	}

	@media (max-width: 520px) {
		.cta-card__body {
			padding: var(--space-2) var(--space-3) var(--space-3);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-image {
			animation: none;
		}

		.cta-card,
		.cta-card__media img {
			transition: none;
		}

		.cta-card:hover .cta-card__media img {
			transform: none;
		}
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

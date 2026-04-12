<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { PUBLIC_SITE_URL } from '$env/static/public';
	import { isDemoMode } from '$lib/demo';

	// Paths are stored without the SvelteKit `base` here and prefixed at
	// render time. Keeps the definitions terse and makes the active-link
	// comparison against `page.url.pathname` straightforward (which *does*
	// include the base when one is configured).
	const nav = [
		{ path: '/', label: 'Home' },
		{ path: '/gallery', label: 'Gallery' },
		{ path: '/shop', label: 'Shop' },
		{ path: '/contact', label: 'Contact' }
	];

	const siteUrl = PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
	const ogImage = `${siteUrl}/two_trees.JPG`;
	$: canonicalUrl = `${siteUrl}${page.url.pathname}`;
</script>

<svelte:head>
	<!-- Site-wide Open Graph defaults.
	     - Per-page <title>, description, og:title, and og:description go in
	       each +page.svelte so there are no duplicates in the built HTML
	       (Svelte dedupes <title> but NOT <meta> tags).
	     - Favicon and theme-color live in app.html, so routes that disable
	       SSR (like /track) still get them in their static HTML shell. -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Meryl Green Designs" />
	<meta property="og:image" content={ogImage} />
	<meta property="og:url" content={canonicalUrl} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

{#if isDemoMode}
	<div class="demo-banner" role="note">
		<div class="container">
			<strong>Preview site</strong> — products are illustrative examples and
			the order form is not connected to a live backend. Submitted orders are
			not saved and no emails are sent.
		</div>
	</div>
{/if}

<header class="site-header">
	<div class="container header-inner">
		<a class="brand" href={`${base}/`}>Meryl Green Designs</a>
		<nav>
			<ul>
				{#each nav as item}
					{@const href = item.path === '/' ? `${base}/` : `${base}${item.path}`}
					<li>
						<a
							{href}
							class:active={page.url.pathname === href ||
								(item.path !== '/' && page.url.pathname.startsWith(href))}
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</header>

<main>
	<slot />
</main>

<footer class="site-footer">
	<div class="container">
		<p>&copy; {new Date().getFullYear()} Meryl Green Designs. All rights reserved.</p>
		<p class="muted">Meryl Green Designs — inspired by nature.</p>
	</div>
</footer>

<style>
	.demo-banner {
		background: #fbe8b0;
		color: #5a4514;
		border-bottom: 1px solid #d4b65a;
		padding: 0.6rem 0;
		font-size: 0.85rem;
		line-height: 1.45;
		text-align: center;
	}

	.demo-banner strong {
		color: #3a2c0a;
	}

	.site-header {
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-rule);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: var(--space-2);
		padding-bottom: var(--space-2);
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.brand {
		font-family: var(--font-display);
		font-size: 1.35rem;
		color: var(--color-leaf-dark);
		border-bottom: none;
	}

	nav ul {
		display: flex;
		gap: var(--space-3);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	nav a {
		font-size: 0.95rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-ink-soft);
	}

	nav a.active {
		color: var(--color-leaf-dark);
		border-bottom-color: var(--color-leaf);
	}

	main {
		min-height: 60vh;
	}

	.site-footer {
		background: var(--color-leaf-dark);
		color: #e8ece1;
		padding: var(--space-4) 0;
		margin-top: var(--space-6);
		text-align: center;
		font-size: 0.9rem;
	}

	.site-footer p {
		margin: 0.25rem 0;
	}

	.site-footer .muted {
		color: #b7c0ae;
		font-style: italic;
	}
</style>

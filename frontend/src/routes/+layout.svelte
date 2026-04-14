<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { PUBLIC_SITE_URL } from '$env/static/public';
	import Cart from '$lib/Cart.svelte';
	import { cart } from '$lib/cartStore.svelte';

	const nav = [
		{ href: '/', label: 'Home' },
		{ href: '/gallery', label: 'Gallery' },
		{ href: '/shop', label: 'Shop' },
		{ href: '/contact', label: 'Contact' }
	];

	const siteUrl = PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
	const ogImage = `${siteUrl}/two_trees.JPG`;
	$: canonicalUrl = `${siteUrl}${page.url.pathname}`;

	let cartOpen = false;
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

<header class="site-header">
	<div class="container header-inner">
		<a class="brand" href="/">Meryl Green Designs</a>
		<div class="header-right">
			<nav>
				<ul>
					{#each nav as item}
						<li>
							<a
								href={item.href}
								class:active={page.url.pathname === item.href ||
									(item.href !== '/' && page.url.pathname.startsWith(item.href))}
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
			<button class="cart-btn" on:click={() => (cartOpen = true)} aria-label="Open cart">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="9" cy="21" r="1"></circle>
					<circle cx="20" cy="21" r="1"></circle>
					<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
				</svg>
				{#if cart.count > 0}
					<span class="cart-badge">{cart.count}</span>
				{/if}
			</button>
		</div>
	</div>
</header>

<main>
	<slot />
</main>

<Cart open={cartOpen} onclose={() => (cartOpen = false)} />

<footer class="site-footer">
	<div class="container">
		<p>&copy; {new Date().getFullYear()} Meryl Green Designs. All rights reserved.</p>
		<p class="muted">Meryl Green Designs — inspired by nature.</p>
	</div>
</footer>

<style>
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

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.cart-btn {
		position: relative;
		background: none;
		border: none;
		color: var(--color-leaf-dark);
		cursor: pointer;
		padding: 4px;
		transition: color 0.15s;
	}

	.cart-btn:hover {
		color: var(--color-leaf);
	}

	.cart-badge {
		position: absolute;
		top: -4px;
		right: -6px;
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		font-size: 0.65rem;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
	}

	main {
		flex: 1;
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

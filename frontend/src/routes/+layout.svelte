<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	const nav = [
		{ href: '/', label: 'Home' },
		{ href: '/gallery', label: 'Gallery' },
		{ href: '/shop', label: 'Shop' },
		{ href: '/contact', label: 'Contact' }
	];
</script>

<div class="construction-banner">
	<div class="container">
		This site is under construction — check back soon for new photographs and finished products.
	</div>
</div>

<header class="site-header">
	<div class="container header-inner">
		<a class="brand" href="/">Meryl Green Designs</a>
		<nav>
			<ul>
				{#each nav as item}
					<li>
						<a
							href={item.href}
							class:active={$page.url.pathname === item.href ||
								(item.href !== '/' && $page.url.pathname.startsWith(item.href))}
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
		<p class="muted">The Green Collection — inspired by nature.</p>
	</div>
</footer>

<style>
	.construction-banner {
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		font-size: 0.85rem;
		text-align: center;
		padding: 0.6rem var(--space-2);
		letter-spacing: 0.04em;
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

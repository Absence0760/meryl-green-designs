<!--
	"On this page" table of contents for the long legal pages (/terms,
	/returns, /privacy). Each page renders it twice from the same list:

	  - variant="inline"  — a collapsed <details> at the top of the text,
	                         shown below 1024px.
	  - variant="sidebar" — a sticky column beside the text from 1024px,
	                         highlighting the section being read
	                         (aria-current="location").

	Only one is displayed at a time (the other is display: none, so it's
	also out of the accessibility tree — one "On this page" landmark).

	`sections` comes from buildToc() in headingSlug.ts; the pages' <h2>s
	carry the matching literal ids (checked by legalPages.test.ts).
	Smooth scrolling is CSS-only and off under prefers-reduced-motion;
	the headings' scroll-margin-top keeps them clear of the sticky header.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { currentSection, type TocEntry } from './headingSlug';

	let {
		sections,
		variant = 'sidebar'
	}: { sections: readonly TocEntry[]; variant?: 'sidebar' | 'inline' } = $props();

	let current = $state<string | null>(null);

	// Reading line, px from the viewport top: just under the sticky site
	// header (~73px, +layout.svelte), a little above where a heading lands
	// after a TOC jump (scroll-margin-top: 6.5rem).
	const LINE = 112;

	onMount(() => {
		if (variant !== 'sidebar' || typeof IntersectionObserver === 'undefined') return;

		const headings = sections
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);
		if (headings.length === 0) return;

		const update = () => {
			const doc = document.documentElement;
			const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
			// Short final sections can never scroll up to the line; at the
			// very bottom of the page the last one is the one being read.
			current = atBottom
				? headings[headings.length - 1]!.id
				: currentSection(
						headings.map((h) => ({ id: h.id, top: h.getBoundingClientRect().top })),
						LINE
					);
		};

		// Fires whenever a heading crosses the reading line (either
		// direction) or enters/leaves the bottom of the viewport.
		const observer = new IntersectionObserver(update, {
			rootMargin: `-${LINE}px 0px 0px 0px`,
			threshold: [0, 1]
		});
		for (const h of headings) observer.observe(h);
		update();

		return () => observer.disconnect();
	});
</script>

{#snippet list()}
	<ol class="toc-list">
		{#each sections as section (section.id)}
			<li>
				<a
					href="#{section.id}"
					class:is-current={current === section.id}
					aria-current={current === section.id ? 'location' : undefined}
				>
					{section.title}
				</a>
			</li>
		{/each}
	</ol>
{/snippet}

{#if variant === 'inline'}
	<details class="legal-toc legal-toc--inline">
		<summary>On this page</summary>
		<nav aria-label="On this page">
			{@render list()}
		</nav>
	</details>
{:else}
	<div class="legal-toc legal-toc--sidebar">
		<nav aria-label="On this page">
			<p class="toc-title">On this page</p>
			{@render list()}
		</nav>
	</div>
{/if}

<style>
	@media (prefers-reduced-motion: no-preference) {
		:global(html:has(.legal-toc)) {
			scroll-behavior: smooth;
		}
	}

	.toc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.1rem;
	}

	.toc-list a {
		display: block;
		padding: 0.3rem 0 0.3rem 0.75rem;
		border-bottom: none;
		border-left: 2px solid transparent;
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--color-ink-soft);
	}

	.toc-list a:hover {
		color: var(--color-bark);
		border-left-color: var(--color-rule);
	}

	.toc-list a:focus-visible {
		outline: 2px solid var(--color-bark);
		outline-offset: 1px;
	}

	.toc-list a.is-current {
		color: var(--color-leaf-dark);
		border-left-color: var(--color-leaf);
		font-weight: 600;
	}

	/* ----- inline (below 1024px) ----- */
	.legal-toc--inline {
		margin: 0 0 var(--space-3);
		border-top: 1px solid var(--color-rule);
		border-bottom: 1px solid var(--color-rule);
	}

	.legal-toc--inline summary {
		cursor: pointer;
		padding: 0.75rem 0;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-bark);
	}

	.legal-toc--inline summary:focus-visible {
		outline: 2px solid var(--color-bark);
		outline-offset: 2px;
	}

	.legal-toc--inline nav {
		padding-bottom: var(--space-2);
	}

	/* ----- sidebar (1024px and up) ----- */
	.legal-toc--sidebar {
		display: none;
	}

	.toc-title {
		margin: 0 0 var(--space-1);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-bark);
	}

	@media (min-width: 1024px) {
		.legal-toc--inline {
			display: none;
		}

		.legal-toc--sidebar {
			display: block;
		}

		.legal-toc--sidebar nav {
			position: sticky;
			/* Clears the sticky site header. */
			top: 6rem;
			max-height: calc(100vh - 7rem);
			overflow-y: auto;
		}
	}
</style>

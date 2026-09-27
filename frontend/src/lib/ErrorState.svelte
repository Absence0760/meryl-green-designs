<!--
	Branded "you've hit a dead end" block: logo emblem, eyebrow, heading,
	message, action buttons. Shared by the root +error.svelte page and the
	/shop/[slug] "Product not found" state so both dead ends look the same.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { base } from '$app/paths';

	let {
		eyebrow,
		heading,
		children,
		actions
	}: {
		eyebrow?: string;
		heading: string;
		children?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="error-state">
	<img class="error-state__mark" src="{base}/logo.svg" alt="" width="104" height="104" />
	{#if eyebrow}
		<p class="eyebrow">{eyebrow}</p>
	{/if}
	<h1>{heading}</h1>
	{#if children}
		<div class="error-state__body">{@render children()}</div>
	{/if}
	{#if actions}
		<div class="error-state__actions">{@render actions()}</div>
	{/if}
</div>

<style>
	.error-state {
		max-width: 34rem;
		margin: 0 auto;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.error-state__mark {
		width: 104px;
		height: 104px;
		margin-bottom: var(--space-3);
	}

	.eyebrow {
		margin-bottom: var(--space-1);
	}

	h1 {
		font-size: clamp(1.9rem, 4vw, 2.75rem);
		margin: 0 0 var(--space-2);
	}

	.error-state__body {
		color: var(--color-ink-soft);
		line-height: 1.7;
	}

	.error-state__body :global(p) {
		margin: 0;
	}

	.error-state__actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
</style>

<!--
	Root error page. Renders for any unknown URL (client-side routing inside
	the 404.html SPA fallback that CloudFront serves for missing objects —
	see docs/architecture.md § SPA fallback) and for any error thrown while
	loading a route. Always noindex: CloudFront answers these with HTTP 200,
	so the robots meta is the only thing keeping them out of search results.
-->
<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/Button.svelte';
	import ErrorState from '$lib/ErrorState.svelte';
	import { errorCopy } from '$lib/errorPage';

	const copy = $derived(errorCopy(page.status));

	function retry() {
		location.reload();
	}
</script>

<svelte:head>
	<title>{copy.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="section error-page">
	<div class="container">
		<ErrorState eyebrow={copy.eyebrow} heading={copy.heading}>
			<p>{copy.body}</p>
			{#snippet actions()}
				{#if copy.notFound}
					<Button href="/shop">Browse the shop</Button>
					<Button href="/" variant="outlined">Back to home</Button>
				{:else}
					<Button on:click={retry}>Try again</Button>
					<Button href="/" variant="outlined">Back to home</Button>
				{/if}
			{/snippet}
		</ErrorState>
	</div>
</section>

<style>
	.error-page {
		padding-top: var(--space-5);
		padding-bottom: var(--space-5);
	}
</style>

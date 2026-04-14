<!--
	Shared Button component. Renders either a <button> or an <a> depending
	on whether `href` is supplied, with a consistent set of visual variants.

	Variants:
	  - primary: filled, dark-leaf on cream (default call-to-action)
	  - outlined: transparent with a dark-leaf outline (secondary action)
	  - ghost: cream outline on a dark backdrop (hero, on-image use)
	  - ghost-primary: filled cream on dark backdrop (hero primary action)

	Keep this small. If a page needs a bespoke button style, it should
	still go through the Button component — add a variant here rather
	than re-inventing the styles locally.
-->
<script lang="ts">
	type Variant = 'primary' | 'outlined' | 'ghost' | 'ghost-primary';
	type Size = 'md' | 'sm';

	export let variant: Variant = 'primary';
	export let size: Size = 'md';
	export let href: string | undefined = undefined;
	export let type: 'button' | 'submit' = 'button';
	export let disabled = false;
	export let ariaLabel: string | undefined = undefined;
</script>

{#if href}
	<a
		class="btn btn--{variant} btn--{size}"
		{href}
		aria-label={ariaLabel}
		on:click
	>
		<slot />
	</a>
{:else}
	<button
		class="btn btn--{variant} btn--{size}"
		{type}
		{disabled}
		aria-label={ariaLabel}
		on:click
	>
		<slot />
	</button>
{/if}

<style>
	.btn {
		display: inline-block;
		font-family: var(--font-body);
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		border-bottom: 1px solid transparent;
		transition:
			background-color 160ms ease,
			color 160ms ease,
			border-color 160ms ease;
	}

	.btn--md {
		padding: 0.65rem 1.4rem;
	}

	.btn--sm {
		padding: 0.4rem 0.9rem;
		font-size: 0.72rem;
	}

	.btn--primary {
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		border: 1px solid var(--color-leaf-dark);
	}

	.btn--primary:hover {
		background: var(--color-bark);
		color: #f6f4ee;
		border-color: var(--color-bark);
	}

	.btn--outlined {
		background: none;
		color: var(--color-leaf-dark);
		border: 1px solid var(--color-leaf-dark);
	}

	.btn--outlined:hover {
		background: var(--color-leaf-dark);
		color: #f6f4ee;
	}

	.btn--ghost-primary {
		background: #f6f4ee;
		color: var(--color-leaf-dark);
		border: 1px solid #f6f4ee;
	}

	.btn--ghost-primary:hover {
		background: var(--color-bark);
		color: #f6f4ee;
		border-color: var(--color-bark);
	}

	.btn--ghost {
		background: none;
		color: #f6f4ee;
		border: 1px solid #f6f4ee;
	}

	.btn--ghost:hover {
		background: rgba(246, 244, 238, 0.12);
		color: #f6f4ee;
	}

	.btn[disabled] {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>

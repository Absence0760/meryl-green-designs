<!--
	Label for the "Add to order" buttons. Both texts sit in the same grid
	cell so the button keeps the width of the longer one — no layout jump
	when it switches to "✓ Added". The hidden text is visibility:hidden,
	so it's left out of the button's accessible name.
-->
<script lang="ts">
	export let added = false;
</script>

<span class="label" class:is-added={added}>
	<span class="label__idle">Add to order</span>
	<span class="label__done"><span aria-hidden="true">✓ </span>Added</span>
</span>

<style>
	.label {
		display: inline-grid;
	}

	.label > span {
		grid-area: 1 / 1;
	}

	.label__done,
	.is-added .label__idle {
		visibility: hidden;
	}

	.is-added .label__done {
		visibility: visible;
	}
</style>

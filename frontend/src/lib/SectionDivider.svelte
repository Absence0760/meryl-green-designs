<!--
	Small acacia-on-a-horizon ornament used between page sections. Drawn
	from the logo's tree so the graphics read as one family. Decorative
	only — hidden from assistive tech.
-->
<script lang="ts">
	import { base } from '$app/paths';
</script>

<div class="divider" aria-hidden="true">
	<img src="{base}/graphics/acacia-divider.svg" alt="" width="220" height="37" />
</div>

<style>
	.divider {
		display: flex;
		justify-content: center;
		padding: var(--space-2) 0;
	}

	.divider img {
		width: 200px;
		height: auto;
		opacity: 0.85;
	}
</style>

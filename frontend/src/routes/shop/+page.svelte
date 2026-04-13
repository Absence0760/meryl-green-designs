<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';
	import { isDemoMode, demoProducts } from '$lib/demo';

	const apiUrl = PUBLIC_API_URL;

	// Products are fetched client-side after mount so the page shell can
	// render instantly. skeletonCount sets how many placeholder cards to
	// show while the real data is loading. In demo mode we skip the fetch
	// entirely and render the hardcoded demoProducts on first paint.
	let products: Product[] = isDemoMode ? demoProducts : [];
	let productsLoading = !isDemoMode;
	let productsError: string | null = null;
	const skeletonCount = 6;

	let submitting = false;
	let error: string | null = null;
	let success: { ref: string } | null = null;
	let values = {
		name: '',
		email: '',
		phone: '',
		address: '',
		items: '',
		notes: '',
		website: ''
	};

	function productMainImage(product: Product): string | null {
		const first = product.photos?.[0];
		// 640px is enough for a ~320px card on a 2x retina display.
		// Without this, Sanity serves the original upload resolution — which
		// for photos straight from a camera can be multiple megabytes each.
		return first ? imageUrl(first, 640) : null;
	}

	function orderProduct(event: MouseEvent, product: Product) {
		event.preventDefault();
		const line = product.priceZar != null
			? `1 x ${product.name} — ${formatPrice(product.priceZar)}`
			: `1 x ${product.name}`;
		values.items = values.items ? `${values.items}\n${line}` : line;
		document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		error = null;

		// Demo mode: skip the backend fetch and show a fake success so the
		// client can see the full post-submit UI without a live Lambda.
		if (isDemoMode) {
			await new Promise((resolve) => setTimeout(resolve, 400));
			success = { ref: 'MG-DEMO-0000' };
			submitting = false;
			return;
		}

		try {
			const res = await fetch(`${apiUrl}/orders`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values)
			});

			const data = (await res.json()) as { success?: true; ref?: string; error?: string };

			if (!res.ok || data.error) {
				error = data.error ?? 'Something went wrong. Please try again.';
				return;
			}

			success = { ref: data.ref ?? '' };
		} catch (e) {
			console.error(e);
			error = 'Could not reach the order service. Please try again.';
		} finally {
			submitting = false;
		}
	}

	onMount(async () => {
		// Demo builds seed `products` synchronously above — nothing to fetch.
		if (isDemoMode) return;

		try {
			const res = await fetch(`${apiUrl}/products`);
			if (!res.ok) {
				productsError = 'Could not load products right now. Please refresh to try again.';
				return;
			}
			const body = (await res.json()) as { products?: Product[] };
			products = body.products ?? [];
		} catch (e) {
			console.error('Failed to fetch products', e);
			productsError = 'Could not load products right now. Please refresh to try again.';
		} finally {
			productsLoading = false;
		}
	});
</script>

<svelte:head>
	<title>Shop — Meryl Green Designs</title>
	<meta
		name="description"
		content="Finished pieces from Meryl Green Designs — printed on durable cotton canvas, framed in stained Meranti hardwood. Order by Electronic Funds Transfer."
	/>
	<meta property="og:title" content="Shop — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Finished pieces from Meryl Green Designs — printed on durable cotton canvas, framed in stained Meranti hardwood. Order by Electronic Funds Transfer."
	/>
</svelte:head>

<section class="section">
	<div class="container">
		<p class="eyebrow">Shop</p>
		<h1>Finished products</h1>
		<p class="lede">
			A selection of finished pieces from Meryl Green Designs, available to order.
		</p>

		<dl class="specs">
			<div class="specs__row">
				<dt>Frame</dt>
				<dd>Meranti hardwood, finished with a traditional teak stain</dd>
			</div>
			<div class="specs__row">
				<dt>Canvas</dt>
				<dd>100% cotton, digitally printed with a protective colour-fast coating</dd>
			</div>
		</dl>
	</div>
</section>

<section class="backdrop" style="background-image: url('/water_reflection.JPG')">
	<div class="container">
		{#if productsLoading}
			<div class="product-grid" aria-busy="true" aria-label="Loading products">
				{#each Array(skeletonCount) as _, i (i)}
					<article class="product product--skeleton" aria-hidden="true">
						<div class="product-image skeleton-shimmer"></div>
						<div class="product-body">
							<div class="skeleton-line skeleton-line--title"></div>
							<div class="skeleton-line skeleton-line--sm"></div>
							<div class="skeleton-line skeleton-line--price"></div>
						</div>
					</article>
				{/each}
			</div>
		{:else if productsError}
			<div class="alert alert--error">{productsError}</div>
		{:else if products.length === 0}
			<div class="empty">
				<p>
					No products are listed yet. Once Meryl adds them in the content studio, they'll
					appear here automatically.
				</p>
			</div>
		{:else}
			<div class="product-grid">
				{#each products as product (product._id)}
					{@const photo = productMainImage(product)}
					<article class="product">
						{#if photo}
							<img
								class="product-image product-image--photo"
								src={photo}
								alt={product.photos?.[0]?.alt ?? product.name}
								loading="lazy"
							/>
						{:else}
							<div class="product-image">Product photo</div>
						{/if}
						<div class="product-body">
							<h3>{product.name}</h3>
							{#if product.blurb}
								<p class="blurb">{product.blurb}</p>
							{/if}
							{#if product.description?.trim()}
								<p class="description">{product.description}</p>
							{/if}
							<p class="price">{formatPrice(product.priceZar)}</p>
							<a
								class="btn"
								href="#order"
								on:click={(e) => orderProduct(e, product)}
							>
								Enquire / Order
							</a>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</section>

<section class="section section--alt" id="order">
	<div class="container narrow">
		<p class="eyebrow">Place an order</p>
		<h2>Order form</h2>
		<p>
			Fill in the form below and we'll email you a confirmation with banking details and a unique
			order reference. Payment is by EFT.
		</p>

		{#if success}
			<div class="alert alert--success">
				<strong>Thank you — your order has been received.</strong>
				<p>
					Your reference is <strong>{success.ref}</strong>. A confirmation email with banking
					details is on its way.
				</p>
				{#if isDemoMode}
					<p class="demo-note">
						(Preview mode — no order was submitted and no email has been sent.)
					</p>
				{/if}
			</div>
		{:else}
			{#if error}
				<div class="alert alert--error">{error}</div>
			{/if}

			<form class="order-form" on:submit={handleSubmit} novalidate>
				<input
					type="text"
					name="website"
					tabindex="-1"
					autocomplete="off"
					class="hp"
					aria-hidden="true"
					bind:value={values.website}
				/>

				<p class="required-hint"><span aria-hidden="true">*</span> Required fields</p>

				<label for="order-name">
					<span>Name <span class="req" aria-hidden="true">*</span></span>
					<input
						id="order-name"
						name="name"
						type="text"
						autocomplete="name"
						required
						bind:value={values.name}
					/>
				</label>
				<label for="order-email">
					<span>Email <span class="req" aria-hidden="true">*</span></span>
					<input
						id="order-email"
						name="email"
						type="email"
						autocomplete="email"
						inputmode="email"
						required
						bind:value={values.email}
					/>
				</label>
				<label for="order-phone">
					<span>Phone <small>(optional)</small></span>
					<input
						id="order-phone"
						name="phone"
						type="tel"
						autocomplete="tel"
						inputmode="tel"
						bind:value={values.phone}
					/>
				</label>
				<label for="order-address">
					<span>Shipping address <span class="req" aria-hidden="true">*</span></span>
					<textarea
						id="order-address"
						name="address"
						rows="3"
						autocomplete="street-address"
						required
						bind:value={values.address}
					></textarea>
				</label>
				<label for="order-items">
					<span>Items <span class="req" aria-hidden="true">*</span></span>
					<textarea
						id="order-items"
						name="items"
						rows="4"
						placeholder="List the items you would like to order"
						required
						bind:value={values.items}
					></textarea>
				</label>
				<label for="order-notes">
					<span>Notes <small>(optional)</small></span>
					<textarea
						id="order-notes"
						name="notes"
						rows="2"
						bind:value={values.notes}
					></textarea>
				</label>

				<button type="submit" class="submit-order" disabled={submitting}>
					{submitting ? 'Sending…' : 'Submit order'}
				</button>
			</form>
		{/if}
	</div>
</section>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Payment</p>
		<h2>How to pay — Electronic Funds Transfer</h2>
		<ol class="payment-steps">
			<li>Place an order using the form above.</li>
			<li>
				You'll immediately receive an email confirming your order request and
				a unique order reference.
			</li>
			<li>
				Meryl will then reply to that email personally with our banking
				details.
			</li>
			<li>
				Pay by Electronic Funds Transfer, using your order reference as the
				payment reference.
			</li>
			<li>Once the payment reflects in our account, we ship your order.</li>
		</ol>
		<p class="note">
			Banking details are only ever sent by a direct reply from Meryl — we
			don't publish them on the site, and they aren't in any automated email.
		</p>
	</div>
</section>

<style>
	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: 0;
	}

	.backdrop {
		background-color: #c8d1b9;
		background-size: cover;
		background-position: center;
		padding: var(--space-4) 0 var(--space-6);
	}

	.specs {
		margin: 0 0 var(--space-4);
		padding: 0 0 0 var(--space-2);
		border-left: 2px solid var(--color-rule);
		max-width: 60ch;
		display: grid;
		gap: 0.4rem;
	}

	.specs__row {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		gap: var(--space-2);
		align-items: baseline;
	}

	.specs dt {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-soft);
	}

	.specs dd {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--color-ink);
	}

	@media (max-width: 480px) {
		.specs__row {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	.narrow {
		max-width: 680px;
	}

	.product-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-3);
	}

	.product {
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}

	.product-image {
		aspect-ratio: 1 / 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-linear-gradient(
			45deg,
			#e3e6da 0 16px,
			#d8dccd 16px 32px
		);
		color: var(--color-ink-soft);
		font-family: var(--font-display);
		font-style: italic;
	}

	.product-image--photo {
		object-fit: cover;
		width: 100%;
		height: auto;
		background: none;
	}

	.empty {
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px dashed var(--color-rule);
		text-align: center;
		color: var(--color-ink-soft);
		font-style: italic;
	}

	/* ----- skeleton loading state ----- */
	.product--skeleton {
		pointer-events: none;
	}

	.skeleton-shimmer,
	.skeleton-line {
		background: linear-gradient(
			90deg,
			#e3e6da 0%,
			#f2f4ea 50%,
			#e3e6da 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.4s infinite linear;
	}

	.skeleton-line {
		height: 0.9rem;
		border-radius: 2px;
		margin-bottom: 0.4rem;
	}

	.skeleton-line--title {
		height: 1.1rem;
		width: 70%;
	}

	.skeleton-line--sm {
		height: 0.75rem;
		width: 90%;
	}

	.skeleton-line--price {
		height: 0.9rem;
		width: 35%;
		margin-top: auto;
	}

	@keyframes skeleton-shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-shimmer,
		.skeleton-line {
			animation: none;
		}
	}

	.product-body {
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		/* Fill the remaining card height so margin-top:auto below can push
		   the price and button to the bottom regardless of how much text
		   the name/blurb/description occupy. */
		flex: 1;
		min-height: 0;
	}

	.product-body h3 {
		margin: 0;
		font-size: 1.15rem;
		/* Reserve exactly two lines for the name so long names wrap but
		   don't shift the blurb/description below them out of alignment. */
	}

	.blurb {
		margin: 0;
		color: var(--color-ink-soft);
		font-size: 0.9rem;
		font-style: italic;
	}

	.description {
		margin: 0;
		color: var(--color-ink-soft);
		font-size: 0.85rem;
		line-height: 1.55;
		/* Preserve newlines the shop owner types into the Sanity textarea,
		   without collapsing adjacent spaces. */
		white-space: pre-line;
	}

	.price {
		margin: 0;
		/* Push the price (and the button that follows) to the bottom of
		   the card. Combined with align-items: stretch on the grid, this
		   keeps every card's price + button on the same baseline regardless
		   of how long the name/blurb/description are above them. */
		margin-top: auto;
		padding-top: var(--space-2);
		font-weight: 600;
		color: var(--color-leaf-dark);
	}

	button,
	.btn {
		margin-top: var(--space-1);
		display: inline-block;
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		border: none;
		padding: 0.65rem var(--space-2);
		font: inherit;
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: center;
		cursor: pointer;
		text-decoration: none;
		border-bottom: none;
	}

	.btn:hover {
		background: #244019;
	}

	button[disabled] {
		background: #a8afa0;
		cursor: not-allowed;
	}

	.order-form {
		display: grid;
		gap: var(--space-2);
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		padding: var(--space-3);
		margin-top: var(--space-3);
	}

	.required-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-ink-soft);
	}

	.required-hint span {
		color: #a2432f;
		font-weight: 700;
	}

	.order-form label {
		display: grid;
		gap: 0.25rem;
	}

	.order-form label > span {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-ink-soft);
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.order-form label small {
		font-size: 0.75rem;
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-ink-soft);
		font-style: italic;
	}

	.req {
		color: #a2432f;
		font-weight: 700;
	}

	.order-form input,
	.order-form textarea {
		font: inherit;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--color-rule);
		background: var(--color-surface);
		color: var(--color-ink);
		border-radius: 2px;
		width: 100%;
		box-sizing: border-box;
	}

	.order-form input:focus,
	.order-form textarea:focus {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.order-form input:invalid:not(:placeholder-shown),
	.order-form textarea:invalid:not(:placeholder-shown) {
		border-color: #a2432f;
	}

	.order-form textarea {
		resize: vertical;
		font-family: inherit;
		min-height: 2.5rem;
	}

	/* The submit button inside the form overrides the shared button/.btn
	   styles: no stacked margin (the grid gap already spaces it from the
	   field above), full width of the form, and a bit more vertical weight
	   so it reads as the form's primary action. */
	.submit-order {
		margin-top: var(--space-1);
		width: 100%;
		padding: 0.9rem var(--space-2);
		font-size: 0.9rem;
	}

	.hp {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.alert {
		padding: var(--space-2) var(--space-3);
		border-radius: 2px;
		margin: var(--space-3) 0;
	}

	.alert--success {
		background: #e4eddb;
		border-left: 4px solid var(--color-leaf);
		color: var(--color-leaf-dark);
	}

	.alert--success p {
		margin: 0.35rem 0 0;
	}

	.alert--success .demo-note {
		font-size: 0.85rem;
		font-style: italic;
		opacity: 0.8;
	}

	.alert--error {
		background: #f5e3e0;
		border-left: 4px solid #a2432f;
		color: #6b2a1b;
	}

	.payment-steps {
		margin: var(--space-3) 0 var(--space-2);
		padding-left: 1.2rem;
		display: grid;
		gap: 0.5rem;
		color: var(--color-ink);
	}

	.payment-steps li {
		line-height: 1.5;
	}

	.note {
		font-size: 0.9rem;
		color: var(--color-ink-soft);
		margin: 0;
		font-style: italic;
	}
</style>

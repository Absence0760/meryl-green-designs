<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { base } from '$app/paths';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';

	const apiUrl = PUBLIC_API_URL;

	// Products are fetched client-side after mount so the page shell can
	// render instantly. skeletonCount sets how many placeholder cards to
	// show while the real data is loading.
	let products: Product[] = [];
	let productsLoading = true;
	let productsError: string | null = null;
	const skeletonCount = 6;

	// --- Cart state ---
	type CartItem = {
		productId: string;
		name: string;
		price: number;
		quantity: number;
	};
	let cart: CartItem[] = [];

	$: cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

	function addToCart(product: Product) {
		const existing = cart.find((item) => item.productId === product._id);
		if (existing) {
			existing.quantity += 1;
			cart = [...cart];
		} else {
			cart = [
				...cart,
				{
					productId: product._id,
					name: product.name,
					price: product.priceZar ?? 0,
					quantity: 1
				}
			];
		}
		document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
	}

	function updateQuantity(productId: string, delta: number) {
		const item = cart.find((i) => i.productId === productId);
		if (!item) return;
		item.quantity += delta;
		if (item.quantity <= 0) {
			cart = cart.filter((i) => i.productId !== productId);
		} else {
			cart = [...cart];
		}
	}

	function removeFromCart(productId: string) {
		cart = cart.filter((i) => i.productId !== productId);
	}

	let submitting = false;
	let error: string | null = null;
	let success: { ref: string } | null = null;

	let values = {
		name: '',
		email: '',
		phone: '',
		address: '',
		notes: '',
		website: ''
	};

	function productMainImage(product: Product): string | null {
		const first = product.photos?.[0];
		return first ? imageUrl(first, 640) : null;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		error = null;

		const body: Record<string, unknown> = {
			name: values.name,
			email: values.email,
			phone: values.phone,
			address: values.address,
			notes: values.notes,
			website: values.website,
			paymentMethod: 'payfast',
			cart: cart.map((item) => ({
				productId: item.productId,
				quantity: item.quantity
			}))
		};

		try {
			const res = await fetch(`${apiUrl}/orders`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = (await res.json()) as {
				success?: true;
				ref?: string;
				error?: string;
				payfast?: { action: string; fields: Record<string, string> };
			};

			if (!res.ok || data.error) {
				error = data.error ?? 'Something went wrong. Please try again.';
				return;
			}

			if (data.payfast) {
				redirectToPayFast(data.payfast);
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

	function redirectToPayFast(payfast: { action: string; fields: Record<string, string> }) {
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = payfast.action;
		for (const [name, value] of Object.entries(payfast.fields)) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = name;
			input.value = value;
			form.appendChild(input);
		}
		document.body.appendChild(form);
		form.submit();
	}

	onMount(async () => {
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
		content="Finished pieces from Meryl Green Designs — printed on durable cotton canvas, framed in stained Meranti hardwood. Pay securely with card, Apple Pay, or EFT."
	/>
	<meta property="og:title" content="Shop — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Finished pieces from Meryl Green Designs — printed on durable cotton canvas, framed in stained Meranti hardwood. Pay securely with card, Apple Pay, or EFT."
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

<section class="backdrop" style="background-image: url('{base}/water2.JPG')">
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
							<button
								class="btn"
								on:click={() => addToCart(product)}
								disabled={product.priceZar == null}
							>
								Add to order
							</button>
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

		{#if cart.length > 0}
			<div class="cart-summary">
				<h3>Your order</h3>
				<ul class="cart-items">
					{#each cart as item (item.productId)}
						<li class="cart-item">
							<span class="cart-item__name">{item.name}</span>
							<span class="cart-item__controls">
								<button
									class="cart-btn"
									on:click={() => updateQuantity(item.productId, -1)}
									aria-label="Decrease quantity"
								>&minus;</button>
								<span class="cart-item__qty">{item.quantity}</span>
								<button
									class="cart-btn"
									on:click={() => updateQuantity(item.productId, 1)}
									aria-label="Increase quantity"
								>&plus;</button>
							</span>
							<span class="cart-item__line-total">
								{formatPrice(item.price * item.quantity)}
							</span>
							<button
								class="cart-remove"
								on:click={() => removeFromCart(item.productId)}
								aria-label="Remove {item.name}"
							>&times;</button>
						</li>
					{/each}
				</ul>
				<p class="cart-total">
					<strong>Total: {formatPrice(cartTotal)}</strong>
				</p>
			</div>
		{/if}

		{#if success}
			<div class="alert alert--success">
				<strong>Thank you — your order has been received.</strong>
				<p>
					Your reference is <strong>{success.ref}</strong>. A confirmation email
					is on its way.
				</p>
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

				<label for="order-notes">
					<span>Notes <small>(optional)</small></span>
					<textarea
						id="order-notes"
						name="notes"
						rows="2"
						bind:value={values.notes}
					></textarea>
				</label>

				{#if cart.length === 0}
					<p class="payment-hint">
						Add products to your order using the "Add to order" buttons above.
					</p>
				{/if}

				<button
					type="submit"
					class="submit-order"
					disabled={submitting || cart.length === 0}
				>
					{#if submitting}
						Processing…
					{:else if cartTotal > 0}
						Pay now — {formatPrice(cartTotal)}
					{:else}
						Pay now
					{/if}
				</button>
			</form>
		{/if}
	</div>
</section>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Payment</p>
		<h2>How to pay</h2>
		<ol class="payment-steps">
			<li>Add items to your order using the "Add to order" buttons above.</li>
			<li>Fill in your details and click "Pay now".</li>
			<li>
				You'll be securely redirected to PayFast to complete your payment
				with a credit or debit card, Apple Pay, SnapScan, or other
				supported methods.
			</li>
			<li>Once payment is confirmed, we ship your order.</li>
		</ol>
		<p class="note">
			All payments are processed securely by PayFast. We never see your
			card details.
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
		flex: 1;
		min-height: 0;
	}

	.product-body h3 {
		margin: 0;
		font-size: 1.15rem;
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
		white-space: pre-line;
	}

	.price {
		margin: 0;
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

	/* --- Cart summary --- */
	.cart-summary {
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
	}

	.cart-summary h3 {
		margin: 0 0 var(--space-1);
		font-size: 1rem;
	}

	.cart-items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	.cart-item {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: 0.9rem;
	}

	.cart-item__name {
		flex: 1;
		min-width: 0;
	}

	.cart-item__controls {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.cart-btn {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		margin: 0;
		font-size: 1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-rule);
		color: var(--color-ink);
		border-radius: 2px;
		text-transform: none;
		letter-spacing: 0;
	}

	.cart-btn:hover {
		background: var(--color-ink-soft);
		color: #fff;
	}

	.cart-item__qty {
		min-width: 1.4rem;
		text-align: center;
		font-weight: 600;
	}

	.cart-item__line-total {
		min-width: 5rem;
		text-align: right;
		font-weight: 600;
		color: var(--color-leaf-dark);
	}

	.cart-remove {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		margin: 0;
		font-size: 1.1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--color-ink-soft);
		text-transform: none;
		letter-spacing: 0;
	}

	.cart-remove:hover {
		color: #a2432f;
		background: transparent;
	}

	.cart-total {
		margin: var(--space-1) 0 0;
		text-align: right;
		font-size: 1rem;
		color: var(--color-leaf-dark);
	}

	.payment-hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		font-style: italic;
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

	.alert--error {
		background: #f5e3e0;
		border-left: 4px solid #a2432f;
		color: #6b2a1b;
	}

	.payment-steps {
		margin: var(--space-2) 0 var(--space-2);
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

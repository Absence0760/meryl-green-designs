<script lang="ts">
	import { PUBLIC_API_URL } from '$env/static/public';
	import { formatPrice, imageUrl, type Product } from '$lib/sanity';
	import type { PageData } from './$types';

	export let data: PageData;

	$: products = data.products;

	const apiUrl = PUBLIC_API_URL;

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
		return first ? imageUrl(first) : null;
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
</script>

<section class="section">
	<div class="container">
		<p class="eyebrow">Shop</p>
		<h1>Finished products</h1>
		<p class="lede">
			A selection of finished pieces from The Green Collection, available to order. The shop is
			currently under construction — product details and imagery will be added shortly.
		</p>

		{#if products.length === 0}
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
			</div>
		{:else}
			{#if error}
				<div class="alert alert--error">{error}</div>
			{/if}

			<form class="order-form" on:submit={handleSubmit}>
				<input
					type="text"
					name="website"
					tabindex="-1"
					autocomplete="off"
					class="hp"
					bind:value={values.website}
				/>

				<label>
					<span>Name</span>
					<input type="text" required bind:value={values.name} />
				</label>
				<label>
					<span>Email</span>
					<input type="email" required bind:value={values.email} />
				</label>
				<label>
					<span>Phone (optional)</span>
					<input type="tel" bind:value={values.phone} />
				</label>
				<label>
					<span>Shipping address</span>
					<textarea rows="3" required bind:value={values.address}></textarea>
				</label>
				<label>
					<span>Items</span>
					<textarea
						rows="4"
						placeholder="List the items you would like to order"
						required
						bind:value={values.items}
					></textarea>
				</label>
				<label>
					<span>Notes (optional)</span>
					<textarea rows="2" bind:value={values.notes}></textarea>
				</label>

				<button type="submit" disabled={submitting}>
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
		<p>
			Online purchases are paid by Electronic Funds Transfer (EFT) directly into our bank
			account. After placing an order you will receive an email confirmation containing the
			full banking details and a unique order reference.
		</p>

		<div class="eft-card">
			<h3>Banking details</h3>
			<dl>
				<dt>Account name</dt>
				<dd>[ To be provided ]</dd>
				<dt>Bank</dt>
				<dd>[ To be provided ]</dd>
				<dt>Account number</dt>
				<dd>[ To be provided ]</dd>
				<dt>Branch code</dt>
				<dd>[ To be provided ]</dd>
				<dt>Reference</dt>
				<dd>Your order number</dd>
			</dl>
			<p class="note">
				Please use your order number as the payment reference. Orders are shipped once payment
				reflects in the account.
			</p>
		</div>
	</div>
</section>

<style>
	.lede {
		max-width: 60ch;
		color: var(--color-ink-soft);
		margin-bottom: var(--space-4);
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

	.order-form label {
		display: grid;
		gap: 0.25rem;
	}

	.order-form label span {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-ink-soft);
	}

	.order-form input,
	.order-form textarea {
		font: inherit;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-rule);
		background: var(--color-surface);
		color: var(--color-ink);
		border-radius: 2px;
	}

	.order-form input:focus,
	.order-form textarea:focus {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.order-form textarea {
		resize: vertical;
		font-family: inherit;
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

	.eft-card {
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-left: 4px solid var(--color-leaf);
		padding: var(--space-3);
		margin-top: var(--space-3);
	}

	.eft-card h3 {
		margin-top: 0;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem var(--space-3);
		margin: 0 0 var(--space-2);
	}

	dt {
		font-weight: 600;
		color: var(--color-ink-soft);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	dd {
		margin: 0;
	}

	.note {
		font-size: 0.9rem;
		color: var(--color-ink-soft);
		margin: 0;
	}
</style>

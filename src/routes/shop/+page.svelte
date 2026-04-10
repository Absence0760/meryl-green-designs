<script lang="ts">
	// TODO: replace with real products once finalised.
	const products = [
		{ id: 1, name: 'Product name', price: 'R —', blurb: 'Short product description.' },
		{ id: 2, name: 'Product name', price: 'R —', blurb: 'Short product description.' },
		{ id: 3, name: 'Product name', price: 'R —', blurb: 'Short product description.' },
		{ id: 4, name: 'Product name', price: 'R —', blurb: 'Short product description.' }
	];
</script>

<section class="section">
	<div class="container">
		<p class="eyebrow">Shop</p>
		<h1>Finished products</h1>
		<p class="lede">
			A selection of finished pieces from The Green Collection, available to order. The shop is
			currently under construction — product details and imagery will be added shortly.
		</p>

		<div class="product-grid">
			{#each products as product (product.id)}
				<article class="product">
					<div class="product-image">Product photo</div>
					<div class="product-body">
						<h3>{product.name}</h3>
						<p class="blurb">{product.blurb}</p>
						<p class="price">{product.price}</p>
						<button type="button" disabled>Enquire / Order</button>
					</div>
				</article>
			{/each}
		</div>
	</div>
</section>

<section class="section section--alt">
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

	.product-body {
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.product-body h3 {
		margin: 0;
		font-size: 1.15rem;
	}

	.blurb {
		margin: 0;
		color: var(--color-ink-soft);
		font-size: 0.9rem;
	}

	.price {
		margin: 0;
		font-weight: 600;
		color: var(--color-leaf-dark);
	}

	button {
		margin-top: var(--space-1);
		background: var(--color-leaf-dark);
		color: #f6f4ee;
		border: none;
		padding: 0.65rem var(--space-2);
		font: inherit;
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	button[disabled] {
		background: #a8afa0;
		cursor: not-allowed;
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

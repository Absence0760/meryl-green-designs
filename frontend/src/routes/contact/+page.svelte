<svelte:head>
	<title>Contact — Meryl Green Designs</title>
	<meta
		name="description"
		content="Get in touch with Meryl Green Designs for enquiries, commissions, or orders."
	/>
	<meta property="og:title" content="Contact — Meryl Green Designs" />
	<meta
		property="og:description"
		content="Get in touch with Meryl Green Designs for enquiries, commissions, or orders."
	/>
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Contact</p>
		<h1>Get in touch</h1>
		<p class="lede">
			Whether you're ordering a finished piece, commissioning something bespoke,
			or just asking a question — Meryl would love to hear from you.
		</p>

		<dl class="contact-list">
			<div class="contact-row">
				<dt>Email</dt>
				<dd>
					<a href="mailto:hello@merylgreendesigns.co.za">hello@merylgreendesigns.co.za</a>
				</dd>
			</div>

			<!-- TODO: replace with real phone, or remove this row if Meryl doesn't
			     want a public number. -->
			<div class="contact-row">
				<dt>Phone</dt>
				<dd class="muted">By email first, please.</dd>
			</div>

			<!-- TODO: replace [town] with Meryl's actual studio location. -->
			<div class="contact-row">
				<dt>Studio</dt>
				<dd>Based in South Africa. Shipped nationwide.</dd>
			</div>

			<div class="contact-row">
				<dt>Response</dt>
				<dd>Expect a reply within two business days.</dd>
			</div>
		</dl>

		<div class="contact-blocks">
			<article class="contact-block">
				<h2>Commissions</h2>
				<p>
					Have a specific photograph, size, or setting in mind? Meryl takes
					bespoke commissions — get in touch by email with a short description
					of what you're after and we'll take it from there.
				</p>
			</article>

			<article class="contact-block">
				<h2>Existing orders</h2>
				<p>
					Already placed an order? You can check its status any time on the
					<a href="/track">track-order page</a> using your reference and email.
				</p>
			</article>
		</div>
	</div>
</section>

<style>
	.narrow {
		max-width: 680px;
	}

	.lede {
		font-size: 1.1rem;
		color: var(--color-ink);
		margin-bottom: var(--space-4);
	}

	.muted {
		color: var(--color-ink-soft);
		font-style: italic;
	}

	/* Structured key/value list for contact details. Two-column on desktop,
	   stacks on narrow viewports. */
	.contact-list {
		display: grid;
		gap: var(--space-2);
		margin: 0 0 var(--space-5);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--color-rule);
		border-bottom: 1px solid var(--color-rule);
	}

	.contact-row {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: var(--space-2);
		align-items: baseline;
	}

	.contact-list dt {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-bark);
	}

	.contact-list dd {
		margin: 0;
		color: var(--color-ink);
	}

	@media (max-width: 520px) {
		.contact-row {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	.contact-blocks {
		display: grid;
		gap: var(--space-3);
	}

	.contact-block h2 {
		font-size: 1.3rem;
		margin: 0 0 var(--space-1);
	}

	.contact-block p {
		margin: 0;
		line-height: 1.7;
	}
</style>

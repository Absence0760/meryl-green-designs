<!--
	Refund / Returns Policy for Meryl Green Designs.

	IMPORTANT: Like privacy/+page.svelte, this is a legal document. The
	policy text below is the client's own wording, with one closing
	sentence added to clarify that statutory consumer rights are not
	displaced (see "Why the CPA line" below). Have a South African
	legal professional review this under Meryl's name before relying
	on it commercially.

	Known gaps (raised with the client but left to legal review):
	  - The blanket "no refunds/cancellations once paid" likely cannot
	    override the implied warranty of quality under section 56 of the
	    Consumer Protection Act, which gives consumers a six-month right
	    to return defective, unsafe, or substandard goods. The closing
	    "These terms do not affect your statutory rights" line is the
	    standard hedge, but it doesn't *solve* the conflict — it just
	    signals that statutory rights still apply where the policy
	    would otherwise exclude them.
	  - The policy only contemplates damaged *packaging*, not items
	    that arrive defective inside undamaged packaging, the wrong
	    item being shipped, or parcels lost in transit.
	  - "Photo on the day of receiving" is stricter than CPA requires
	    and may be unenforceable in practice (recipient travelling,
	    parcel held at reception, etc.).
	  - Made-to-order items are CPA section 20 cooling-off exempt, but
	    only if framed as specially produced for the buyer. The wording
	    here implies that but doesn't state it.

	Update the "Last updated" date whenever the policy text changes.
-->
<script lang="ts">
	const lastUpdated = 'May 2026';
</script>

<svelte:head>
	<title>Refund &amp; Returns Policy — Meryl Green Designs</title>
	<meta
		name="description"
		content="How Meryl Green Designs handles refunds, cancellations, and damaged-on-delivery returns."
	/>
	<meta property="og:title" content="Refund & Returns Policy — Meryl Green Designs" />
	<meta
		property="og:description"
		content="How Meryl Green Designs handles refunds, cancellations, and damaged-on-delivery returns."
	/>
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Legal</p>
		<h1>Refund &amp; Returns Policy</h1>
		<p class="muted">Last updated: {lastUpdated}</p>

		<p class="lede">
			Every screen we make is handcrafted to order. This page
			explains when an order can be refunded or returned, and what
			to do if your package arrives damaged.
		</p>

		<h2>Made-to-order &mdash; no refunds or cancellations after payment</h2>
		<p>
			All items ordered will be manufactured once full payment has
			been received. At this point no refunds or cancellations
			will be accepted.
		</p>

		<h2>Damaged on arrival</h2>
		<p>
			Returns are accepted if the package is received damaged. A
			photo of the damaged package needs to be sent on the day of
			receiving the package, in which case the package will be
			collected by the courier service and returned free of
			charge. A replacement item will be put into production and
			shipped within 3&ndash;4 weeks after receiving the damaged
			item back in our factory.
		</p>

		<h2>How to claim</h2>
		<p>
			To report a damaged delivery or ask a question about an
			order, please email
			<a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>
			and include your order reference and a photo of the damaged
			package.
		</p>

		<h2>Your statutory rights</h2>
		<p>
			These terms do not affect your statutory rights as a
			consumer under the South African Consumer Protection Act,
			68 of 2008.
		</p>
	</div>
</section>

<style>
	.narrow {
		max-width: 720px;
	}

	.muted {
		color: var(--color-ink-soft);
		font-style: italic;
		margin-top: calc(var(--space-1) * -1);
		margin-bottom: var(--space-3);
		font-size: 0.9rem;
	}

	.lede {
		font-size: 1.05rem;
		margin-bottom: var(--space-4);
	}

	h2 {
		font-size: 1.4rem;
		margin-top: var(--space-4);
		margin-bottom: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-rule);
	}

	p {
		line-height: 1.75;
		margin: 0 0 var(--space-2);
	}
</style>

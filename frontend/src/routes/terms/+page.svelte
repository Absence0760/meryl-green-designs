<!--
	Terms & Conditions for Meryl Green Designs.

	IMPORTANT: Like privacy/+page.svelte and returns/+page.svelte, this is
	a legal document. It is drafted to be a starting point appropriate for
	a small South African handcrafted-goods retailer, written to be
	accurate to the site's actual data flows and the realities of how the
	business operates. It MUST be reviewed by a South African legal
	professional under Meryl's name before going live.

	Scope of this draft:
	  - Acceptance of terms and how changes are communicated
	  - Order formation point (offer / acceptance) and when the contract
	    is formed under SA contract law + ECT Act
	  - Pricing in ZAR and right to correct typographical errors
	  - Made-to-order nature (lead times, customisation, no cooling-off
	    for specially-produced goods per CPA s20 / ECT Act s44)
	  - Risk transfer at delivery to the courier address provided
	  - Cross-references to Returns + Privacy rather than duplicating
	  - Intellectual property — Meryl retains all rights in her designs
	  - Acceptable use of the website
	  - Statutory-rights-preserving limitation of liability (CPA s51
	    voids any term that purports to exclude statutory protections)
	  - Severability + governing law (South Africa, Western Cape courts
	    as default — Meryl can substitute her actual province)
	  - Dispute resolution path: CGSO first, courts as fallback
	  - ECT Act s43 disclosure cross-reference (placeholders live in
	    Returns until Meryl provides real business details)

	Items the legal reviewer must specifically confirm or fill in:
	  - The governing-law clause is split into two limbs: consumer-
	    initiated proceedings may be brought in the consumer's local
	    Magistrates' Court / High Court division, while supplier-
	    initiated proceedings are brought in the consumer's local
	    division (with optional Western Cape consent). This structure
	    respects CPA s48 and Magistrates' Courts Act s28; reviewer to
	    confirm.
	  - Lead times are stated as a hard upper bound ("each piece is
	    produced within 6 weeks of payment unless we contact you to
	    agree a longer time"). Reviewer to confirm 6 weeks matches
	    Meryl's actual production window.
	  - The 14-day window for accepting price-error corrections is
	    paired explicitly with CPA s23(9)'s "reasonable consumer would
	    have realised it was an error" test; reviewer to confirm
	    against current CGSO pricing-correction guidance.
	  - The age-of-majority clause (18) matches SA's Children's Act and
	    Contractual Capacity rules; reviewer should confirm no need for
	    a stricter age gate.
	  - The limitation-of-liability clause carves out explicitly:
	    death/personal injury, CPA s61 strict liability, gross
	    negligence, and any liability that cannot lawfully be limited.
	    Reviewer may want to extend or tighten further but should not
	    weaken the carve-outs.
	  - The order-formation language distinguishes two emails: the
	    "Order received" acknowledgement (post-POST /orders) and the
	    "Order confirmed" acceptance (post-payment ITN). The email
	    templates must use exactly those two subject lines; verify in
	    backend/src/email-templates.ts before launch.
	  - The IP clause carves out the first-sale doctrine (Copyright
	    Act s23) so buyers can resell the physical screen they bought.
	    Social-media sharing is framed as a limited non-commercial
	    licence with credit requested. Reviewer to confirm scope.
	  - Acceptance of terms is framed as clickwrap at checkout (NOT
	    browsewrap on page load). The checkout form must include a
	    required tickbox linking to Terms/Returns/Privacy before
	    launch; tracked in docs/roadmap.md.

	Update the "Last updated" date whenever the terms text changes.
-->
<script lang="ts">
	const lastUpdated = '15 May 2026';
</script>

<svelte:head>
	<title>Terms &amp; Conditions — Meryl Green Designs</title>
	<meta
		name="description"
		content="The terms and conditions that apply when you use the Meryl Green Designs website or place an order."
	/>
	<meta property="og:title" content="Terms & Conditions — Meryl Green Designs" />
	<meta
		property="og:description"
		content="The terms and conditions that apply when you use the Meryl Green Designs website or place an order."
	/>
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Legal</p>
		<h1>Terms &amp; Conditions</h1>
		<p class="muted">Last updated: {lastUpdated}</p>

		<p class="lede">
			These terms apply when you use this website or place an order with
			Meryl Green Designs. They set out how the contract between you and
			us is formed, what each side commits to, and what happens if
			something goes wrong. Two related documents sit alongside these
			terms: the <a href="/returns">Refund &amp; Returns Policy</a> covers
			cancellations and defective goods, and the
			<a href="/privacy">Privacy Policy</a> covers how we handle your
			personal information.
		</p>

		<h2>Who you are contracting with</h2>
		<p>
			Meryl Green Designs (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a South African studio that
			designs and hand-makes screens to order. Full business
			identification details (registered name, legal status, physical
			address, registration number) required under section 43 of the
			Electronic Communications and Transactions Act, 2002 (ECT Act)
			are set out in the <a href="/returns">Refund &amp; Returns Policy</a>.
		</p>

		<h2>Acceptance of these terms</h2>
		<p>
			When you place an order you confirm, by ticking the
			confirmation box at checkout, that you have read and accepted
			these terms together with the
			<a href="/returns">Refund &amp; Returns Policy</a> and the
			<a href="/privacy">Privacy Policy</a>. The three documents
			operate together. If you do not agree with any part of them,
			please don't place an order.
		</p>
		<p>
			You must be at least 18 years old, or have the consent of a parent
			or legal guardian, to place an order through this site.
		</p>

		<h2>Changes to these terms</h2>
		<p>
			We may update these terms from time to time to reflect changes in
			how we operate, or to keep them aligned with South African law.
			The &ldquo;Last updated&rdquo; date at the top of the page shows
			when the current version was published. The terms that apply to
			your order are the ones that were live on the site at the moment
			you placed the order &mdash; later changes don't apply
			retroactively.
		</p>

		<h2>About the website</h2>
		<p>
			This site is operated as an online catalogue and order channel
			for Meryl Green Designs. Product photographs, descriptions, and
			dimensions are provided in good faith and are accurate to the
			best of our knowledge. Because each screen is handcrafted, there
			will be small natural variations between the photo and the piece
			you receive (grain, finish, hand-printing) &mdash; this is part
			of the made-to-order character and is not a defect.
		</p>

		<h2>Pricing</h2>
		<p>
			All prices on the site are in <strong>South African Rand
			(ZAR)</strong>, inclusive of value-added tax where applicable, and
			exclusive of shipping. Shipping costs (if any) are added during
			checkout or quoted by us before production starts, depending on
			the destination and the piece.
		</p>
		<p>
			Despite our best efforts, prices can occasionally appear
			incorrectly on the site due to a typographical or system error.
			If we discover an error in a price after you've placed an order,
			we'll contact you to confirm the corrected price before
			production starts. You can either accept the corrected price or
			cancel the order in full for a refund of any amount already
			paid. Section 23 of the Consumer Protection Act, 2008 (CPA),
			read with section 23(9), allows a supplier to decline to sell
			at a displayed price only where the displayed price was so
			inadequate that a reasonable consumer would have realised it
			was an error. We will only invoke a correction on that
			footing. If we contact you about a price correction, please
			confirm or decline within <strong>14 days</strong> &mdash; if
			we don't hear back in that window, we'll treat the order as
			cancelled and refund any amount paid.
		</p>

		<h2>Placing an order</h2>
		<p>
			When you add items to your cart and submit the order form, you
			are making us an <strong>offer</strong> to buy those items at
			the prices shown. Listing items on the site, or accepting your
			payment, does not by itself form a contract.
		</p>
		<p>
			Submitting the order form triggers an immediate
			&ldquo;Order received&rdquo; email confirming we have your
			offer and have queued it for processing. <strong>This first
			email is not an acceptance.</strong> A contract between you
			and us is formed only when we send you the separate
			&ldquo;Order confirmed&rdquo; email after your payment has
			cleared via PayFast. We reserve the right to decline an order
			before sending the confirmation email &mdash; for example, if
			a piece is unexpectedly unavailable, if there's a pricing
			error, or if we cannot verify the shipping address. If we
			decline, we'll refund any payment in full.
		</p>

		<h2>Made-to-order &mdash; lead times</h2>
		<p>
			Production on each screen begins after full payment has been
			received and the order confirmation has been sent. <strong>Each
			piece is produced within 6 weeks of payment</strong> unless
			we contact you to agree a longer time. Most pieces ship
			sooner; the 6-week figure is the upper bound, not the typical
			case. We'll keep you updated by email at the major status
			changes (payment received, in production, shipped).
		</p>
		<p>
			Because each piece is specially produced for you after you
			order, the 7-day cooling-off right under section 44 of the
			Electronic Communications and Transactions Act, 2002 does
			not apply &mdash; section 44(3)(c) of that Act exempts goods
			made to the consumer's specifications. Your statutory rights
			if something goes wrong with the order are unaffected &mdash;
			see the <a href="/returns">Refund &amp; Returns Policy</a> for
			the full set of remedies.
		</p>

		<h2>Payment</h2>
		<p>
			Payment is handled by <a
				href="https://www.payfast.co.za"
				target="_blank"
				rel="noopener noreferrer">PayFast</a>, a South African payment
			gateway. You'll be redirected to PayFast's hosted payment page to
			enter your card or payment details. We never see, store, or
			process your card details &mdash; PayFast sends us back only a
			confirmation that payment has been received.
		</p>
		<p>
			Your contract for the payment itself is between you and PayFast;
			their <a
				href="https://www.payfast.co.za/legal/terms-of-service"
				target="_blank"
				rel="noopener noreferrer">terms of service</a> apply to that
			part of the transaction.
		</p>

		<h2>Delivery, risk, and ownership</h2>
		<p>
			We deliver to addresses within South Africa using a third-party
			courier. The estimated delivery date we send you once the piece
			is dispatched is an estimate, not a guaranteed delivery time
			&mdash; courier-side delays are outside our control.
		</p>
		<p>
			<strong>Risk in the goods</strong> passes to you on
			<strong>successful delivery</strong> &mdash; that is, when
			the goods are accepted at the address you provided. If the
			courier cannot deliver because no one is available to
			receive the goods, we and the courier will make reasonable
			further attempts and, if necessary, agree a redelivery with
			you; risk only passes once the goods are actually accepted.
			<strong>Ownership</strong> of the goods passes to you once
			full payment has cleared. Damaged-on-arrival packaging,
			defective items, wrong items, and lost-in-transit
			deliveries are covered by the
			<a href="/returns">Refund &amp; Returns Policy</a>.
		</p>

		<h2>Cancellations, returns, and refunds</h2>
		<p>
			These are covered in detail in the
			<a href="/returns">Refund &amp; Returns Policy</a>, which forms
			part of these terms. In short: change-of-mind cancellations are
			not accepted because each piece is specially produced, but
			defective items, wrong items, damaged-on-arrival packaging,
			lost-in-transit deliveries, and unreasonable delivery delays are
			all covered by SA statutory remedies that the Returns Policy
			describes.
		</p>

		<h2>Personal information</h2>
		<p>
			Information you give us when placing an order, tracking an
			order, or contacting us is handled in line with the
			<a href="/privacy">Privacy Policy</a>, which forms part of these
			terms. The Privacy Policy explains what we collect, how we use
			it, who we share it with, how long we keep it, and the rights
			you have under the Protection of Personal Information Act, 2013
			(POPIA).
		</p>

		<h2>Intellectual property</h2>
		<p>
			All designs, illustrations, photographs, product names, and
			written content on this site are owned by Meryl Green Designs
			(or licensed to us by the photographers and contributors who
			created them). When you buy a screen, you buy the physical
			object &mdash; the underlying design remains ours. You may
			not <strong>reproduce, copy, or manufacture</strong> pieces
			based on our designs, or sell such reproductions, without
			our prior written permission. This restriction does not
			limit your right to resell the physical screen you bought
			from us &mdash; that right is yours under the first-sale
			doctrine in section 23 of the Copyright Act, 1978.
		</p>
		<p>
			You may photograph the screen you bought and share those
			photos on social media for personal, non-commercial
			purposes &mdash; we'd appreciate credit to Meryl Green
			Designs where you can give it. This permission does not
			extend to commercial use or merchandising of the photos.
		</p>

		<h2>Acceptable use of the website</h2>
		<p>
			Please use the site only for lawful purposes. You agree not to:
		</p>
		<ul>
			<li>Use the site in a way that could damage, disable, or
				impair it for other users.</li>
			<li>Attempt to gain unauthorised access to any part of the site,
				the server hosting it, or any database it connects to.</li>
			<li>Use automated systems (bots, scrapers, harvesters) to extract
				content or place fraudulent orders.</li>
			<li>Submit content, names, or addresses that are false,
				misleading, or designed to impersonate someone else.</li>
		</ul>
		<p>
			We reserve the right to cancel any order, refuse future orders,
			or restrict access to the site where we reasonably believe these
			rules have been broken.
		</p>

		<h2>Limitation of liability</h2>
		<p>
			Nothing in these terms excludes or limits any right or remedy
			you have under the Consumer Protection Act, 2008 or any other
			South African law that cannot be contracted out of. Section 51
			of the CPA voids any term that purports to do so.
		</p>
		<p>
			Subject to that, we are not liable to you for any indirect or
			consequential loss arising from the use of the site or from a
			purchase &mdash; for example, lost profit, lost business
			opportunity, or damage to property unrelated to the goods
			themselves. Our maximum liability for any direct loss arising
			from an order is limited to the amount you paid for that order.
		</p>
		<p>
			The limit above does <strong>not</strong> apply to, and we
			make no attempt to exclude or limit, any of the following:
		</p>
		<ul>
			<li>Liability for death or personal injury caused by our
				negligence;</li>
			<li>Liability under section 61 of the Consumer Protection
				Act for harm caused by unsafe, defective, or hazardous
				goods (which the CPA imposes on a strict-liability
				basis and which a contract cannot displace);</li>
			<li>Liability arising from our gross negligence or wilful
				misconduct;</li>
			<li>Any other liability that, under South African law,
				cannot lawfully be limited or excluded by contract.</li>
		</ul>

		<h2>Severability</h2>
		<p>
			If any part of these terms is found to be unenforceable by a
			competent court, the rest of the terms remain in force.
		</p>

		<h2>Governing law and dispute resolution</h2>
		<p>
			These terms, and any contract formed under them, are governed
			by the laws of the Republic of South Africa.
		</p>
		<p>
			If you have a dispute with us, please contact us first by email
			at <a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>
			&mdash; most issues are resolved quickly that way. If we
			can't resolve the dispute directly, you may refer the matter
			to the
			<a
				href="https://www.cgso.org.za"
				target="_blank"
				rel="noopener noreferrer">Consumer Goods and Services Ombud
				(CGSO)</a>, the
			<a
				href="https://thencc.gov.za"
				target="_blank"
				rel="noopener noreferrer">National Consumer Commission
				(NCC)</a>, or take it to court &mdash; whichever route
			you prefer. Section 69 of the Consumer Protection Act
			preserves all three options at your election.
		</p>
		<p>
			If <strong>you</strong> bring court proceedings against us,
			you may do so in your local Magistrates' Court, the High
			Court division covering your residence, or the Western Cape
			Division of the High Court of South Africa. If
			<strong>we</strong> bring proceedings against you, we will
			bring them in the High Court division covering your
			residence or, with your written consent, in the Western
			Cape Division. Nothing in this clause limits your rights
			under section 48 of the Consumer Protection Act or under
			section 28 of the Magistrates' Courts Act.
		</p>

		<h2>Questions about these terms</h2>
		<p>
			If anything in these terms is unclear, please email
			<a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>
			and we'll do our best to explain.
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

	ul {
		line-height: 1.75;
		margin: 0 0 var(--space-2);
		padding-left: 1.25rem;
	}

	li {
		margin-bottom: 0.35rem;
	}
</style>

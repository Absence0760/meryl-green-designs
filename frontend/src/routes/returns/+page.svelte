<!--
	Refund / Returns Policy for Meryl Green Designs.

	IMPORTANT: Like privacy/+page.svelte, this is a legal document. This
	version expands the client's original two-paragraph wording to cover
	scenarios South African consumer law obliges retailers to address
	and customer scenarios that will realistically occur. It is still a
	draft and MUST be reviewed by a South African legal professional
	under Meryl's name before going live.

	What this draft adds beyond the client's original wording:
	  - Defective items in undamaged packaging (CPA s56 implied warranty
	    of quality, 6-month right to return / repair / replace / refund)
	  - Wrong-item-shipped flow (factory error)
	  - Lost-in-transit / non-delivery flow
	  - Late delivery (CPA s19 right to cancel for unreasonable delay)
	  - "Specially produced" framing for the cooling-off exemption
	    (CPA s20 / ECT Act s44 both exclude specially-produced goods)
	  - Explicit repair / replacement / refund choice under CPA s56
	  - Shipping-cost allocation (who pays for what when)
	  - Escalation cap when a replacement also fails
	  - Consumer Goods and Services Ombud (CGSO) dispute-resolution path
	  - ECT Act s43 business-identification block under
	    "About Meryl Green Designs" (registered name, legal status,
	    physical address, telephone, email; no CIPC number — Meryl
	    trades as a sole proprietor)
	  - Tighter "no refunds" wording that doesn't read as overriding
	    statutory rights

	Items the legal reviewer must specifically confirm or fill in:
	  - The 48-hour damage-photo window is framed as a courier-insurance
	    deadline that does NOT bar the consumer's CPA s56 right (6-month
	    statutory window). Reviewer to confirm against Meryl's actual
	    courier-insurance terms.
	  - The 7-day defective-notification window is framed as a courtesy
	    request, not a statutory bar — the s56 6-month right is
	    preserved explicitly. CPA s51 voids any term that contracts
	    around s56.
	  - The 4-week non-delivery threshold is a generous default for
	    SA courier networks; Meryl can tighten if her couriers are fast.
	  - The 14-business-day refund-back-to-customer timeline is aligned
	    with CGSO guidance; reviewer to confirm against current CGSO
	    code-of-conduct expectations.
	  - The cooling-off section cites ECT s44(3)(c) only (specially-
	    produced goods exemption) — CPA s20 is not cited because it
	    applies to direct-marketing transactions only, which this site
	    does not engage in.
	  - The consumer's right under CPA s56(2) to CHOOSE between repair /
	    replace / refund is preserved explicitly; do not let any later
	    edit revert to "we default to offering replacement".
	  - Section 56(3) escalation right after one failed repair/replace
	    is preserved explicitly; do not let any later edit revert to
	    "we will not accept more than two attempts" (which inverts the
	    statutory right).
	  - ECT Act s43 disclosure block is now in place under
	    "About Meryl Green Designs". Meryl supplied the values
	    (sole proprietor, no CIPC number; address + cell as shown).
	    Reviewer to confirm the values look correct as printed and
	    that "Not applicable — sole proprietorships are not required
	    to register with CIPC" is an acceptable phrasing of the s43(e)
	    no-registration-number disclosure.

	Open questions surfaced by the rsa-legal-doc-reviewer sweep on
	2026-05-15 (see commit 4cb053c for the agent definition):
	  - ECT s43(1)(n) — does the existing /track page (order-ref +
	    email lookup → full order detail) satisfy the consumer's
	    right to "access and maintain a full record of the
	    transaction", or does the statute contemplate a more formal
	    export / download mechanism?
	  - ECT s43(1)(k) — lead times currently appear only in the
	    Terms (read at clickwrap) and not on shop-product pages.
	    Is clickwrap-time disclosure adequate pre-transaction
	    disclosure under s43(1)(k), or must the lead-time figure
	    appear on the shop page itself before "Add to cart"?
	  - ECT s43(1)(d)/(e)/(r) — Meryl is not a member of any
	    self-regulatory body and the only DR code in play is the
	    CGSO. Is silence acceptable for a non-member, or should
	    the s43 block affirmatively state non-membership and name
	    CGSO as the applicable DR forum?
	  - Wrong-item-shipped flow — the section now mirrors the
	    defective-goods s56 carve-out (15 May 2026 edit). Reviewer
	    to confirm a wrong-item delivery actually falls under s56
	    implied-warranty-of-quality, vs. a different statutory
	    pocket (contract performance / ECT s46).
	  - Refund timeline — the 14-business-day clock anchors to
	    "our agreement that a refund is due". A consumer with a
	    clear s56(2) election could argue the clock should start
	    from their election, not the merchant's agreement.
	    Reviewer to confirm CGSO guidance.
	  - Distributed-vs-consolidated s43 disclosure — items are
	    spread across /returns (identification block) and /terms
	    (lead times, payment manner, service description). Some
	    regulators prefer a single consolidated block; the Act
	    only requires accessibility. Reviewer to confirm the
	    distributed approach is acceptable in practice.

	Update the "Last updated" date whenever the policy text changes.
-->
<script lang="ts">
	const lastUpdated = '15 May 2026';
</script>

<svelte:head>
	<title>Refund &amp; Returns Policy — Meryl Green Designs</title>
	<meta
		name="description"
		content="How Meryl Green Designs handles refunds, cancellations, damaged or defective orders, and lost or late deliveries."
	/>
	<meta property="og:title" content="Refund & Returns Policy — Meryl Green Designs" />
	<meta
		property="og:description"
		content="How Meryl Green Designs handles refunds, cancellations, damaged or defective orders, and lost or late deliveries."
	/>
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Legal</p>
		<h1>Refund &amp; Returns Policy</h1>
		<p class="muted">Last updated: {lastUpdated}</p>

		<p class="lede">
			Every screen we make is handcrafted to order. This page
			explains how cancellations, refunds, replacements, damaged
			goods, defective goods, wrong items, lost deliveries, and
			late deliveries are handled &mdash; and what to do if any of
			those happen to your order.
		</p>

		<h2>Made-to-order &mdash; cancellations and change-of-mind</h2>
		<p>
			Each screen is <strong>specially produced for the buyer</strong>
			&mdash; production begins once full payment has been received.
			Because of this we cannot accept change-of-mind cancellations
			or refunds after payment.
		</p>
		<p>
			The 7-day cooling-off right under section 44 of the
			Electronic Communications and Transactions Act, 2002 (ECT
			Act) does not apply to goods made to the consumer's
			specifications (section 44(3)(c)). Because each piece is
			specially produced for you after you order, that exemption
			covers orders placed through this site.
		</p>
		<p>
			This does not affect your statutory rights below if something
			goes wrong with the order itself.
		</p>

		<h2>If your package arrives damaged on the outside</h2>
		<p>
			If the box you receive is visibly damaged when the courier
			delivers it, please email us a photo as soon as you can &mdash;
			ideally within <strong>48 hours of delivery</strong>. The
			48-hour window helps us file a courier-insurance claim
			while the evidence is fresh, but it does not affect your
			rights under section 56 of the Consumer Protection Act if
			you notice the damage later. Once we have your photo we
			will arrange courier collection of the package at no cost
			to you, and a replacement will be put into production and
			shipped within 3&ndash;4 weeks of the original item arriving
			back at our workshop.
		</p>

		<h2>If your item is defective or arrives broken inside intact packaging</h2>
		<p>
			If the package looks fine but the screen itself has a
			manufacturing flaw, a broken hinge, the wrong colour or
			finish, or any defect that prevents it from being used as
			intended, please tell us as soon as you can &mdash;
			ideally within 7 days of delivery so we can inspect it
			promptly with the issue fresh in mind. Your statutory right
			under section 56 of the Consumer Protection Act to ask for a
			refund, repair, or replacement runs for <strong>six months
			from delivery</strong> and is not affected if you notify us
			later within that window.
		</p>
		<p>
			Section 56 entitles you to choose between a
			<strong>repair</strong>, a <strong>replacement</strong>, or a
			<strong>refund</strong> &mdash; the choice is yours, not ours.
			Once you've told us which remedy you'd like, we'll arrange
			courier collection at no cost to you.
		</p>

		<h2>If you receive the wrong item</h2>
		<p>
			If we send you something other than what you ordered, please
			email us within 7 days of delivery. We will arrange a free
			courier collection of the wrong item and ship the correct
			item once the original is back with us. The 7-day window
			helps us turn the order around quickly while shipping
			information is fresh; your statutory rights under section 56
			of the Consumer Protection Act run for <strong>six months
			from delivery</strong> and are not affected if you notice the
			mismatch later within that window.
		</p>

		<h2>If your order does not arrive</h2>
		<p>
			If 4 weeks have passed since your shipping notification and
			your order has still not been delivered, please contact us.
			We will work with the courier to trace the parcel. If it
			cannot be recovered we will, at your choice, either produce
			and ship a replacement at no cost to you or issue a full
			refund.
		</p>

		<h2>If your delivery is significantly late</h2>
		<p>
			We aim to ship within the timeframe communicated when you
			place your order. If delivery is unreasonably delayed beyond
			that timeframe, you have the right under section 19 of the
			Consumer Protection Act to cancel the order and receive a
			full refund. We will usually offer to agree a revised
			delivery date with you first, but you are not obliged to
			accept one — the cancellation right under section 19 is
			yours regardless.
		</p>

		<h2>How to claim</h2>
		<p>
			To start any of the processes above, email
			<a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>
			and include:
		</p>
		<ul>
			<li>Your order reference (e.g. <code>MG-260413-AB12</code>)</li>
			<li>The email address you used to place the order</li>
			<li>A short description of the issue</li>
			<li>One or more clear photos, if the issue is visible</li>
		</ul>
		<p>
			We aim to acknowledge claims within 2 business days. From
			there, processes (collection, refund, replacement) typically
			complete within the timelines stated above.
		</p>

		<h2>Refunds, replacements, and shipping costs</h2>
		<p>
			Where you are entitled to a remedy under this policy or
			under the Consumer Protection Act, <strong>you</strong>
			choose between a <strong>repair</strong>, a
			<strong>replacement</strong>, or a <strong>refund</strong>
			— section 56(2) of the CPA gives that election to the
			consumer. We will fulfil whichever you select.
		</p>
		<p>
			<strong>Courier costs</strong> for any free collection
			described above are covered by us. <strong>Original delivery
			charges</strong> are refunded in full if the issue is our
			responsibility (damaged on arrival, defective, wrong item,
			non-delivery, significant delay). Refunds are processed back
			to the original payment method within <strong>14 business
			days</strong> of our agreement that a refund is due. Once we
			initiate the refund, the payment provider (PayFast) typically
			settles the funds back to your card within a further
			3&ndash;5 business days.
		</p>

		<h2>If a replacement also has a problem</h2>
		<p>
			Section 56(3) of the Consumer Protection Act gives you the
			right, after one failed repair or replacement, to escalate
			to a <strong>full refund</strong> rather than accept further
			repair attempts. So if the replacement we ship is also
			damaged or defective, you may &mdash; at your choice &mdash;
			ask for a second replacement or a full refund including all
			shipping costs. You are not obliged to accept further
			repair attempts.
		</p>

		<h2>Your statutory rights and dispute resolution</h2>
		<p>
			Nothing in this policy excludes or limits your rights under
			the South African Consumer Protection Act, 68 of 2008,
			including the implied warranty of quality (section 56), the
			right to safe and good-quality goods, and the right to cancel
			for unreasonable delay (section 19).
		</p>
		<p>
			If we cannot resolve a complaint to your satisfaction, you
			may refer the matter to the
			<a
				href="https://www.cgso.org.za"
				target="_blank"
				rel="noopener noreferrer">Consumer Goods and Services Ombud
				(CGSO)</a>, the
			<a
				href="https://thencc.gov.za"
				target="_blank"
				rel="noopener noreferrer">National Consumer Commission (NCC)</a>,
			or take it to court — whichever route you prefer. Section
			69 of the Consumer Protection Act preserves all three options
			at your election; you are not obliged to use any one of
			them in preference to the others.
		</p>

		<h2>About Meryl Green Designs</h2>
		<p>
			Meryl Green Designs is a South African studio handcrafting
			screens and nature-inspired designs. The details below are
			published in compliance with section 43 of the Electronic
			Communications and Transactions Act, 2002.
		</p>
		<dl class="business-identity">
			<dt>Registered business name</dt>
			<dd>Meryl Green Designs</dd>

			<dt>Legal status</dt>
			<dd>Sole proprietor</dd>

			<dt>Business registration number</dt>
			<dd>
				Not applicable &mdash; sole proprietorships are not
				required to register with the Companies and Intellectual
				Property Commission (CIPC) under South African law.
			</dd>

			<dt>Industry membership</dt>
			<dd>
				Meryl Green Designs is not a member of any industry
				self-regulatory or accreditation body.
			</dd>

			<dt>Physical address</dt>
			<dd>
				Unit 2 Nordyk Park<br />
				Commercial Street<br />
				Malmesbury, 7300<br />
				South Africa
			</dd>

			<dt>Telephone</dt>
			<dd><a href="tel:+27823264555">082 326 4555</a></dd>

			<dt>Website</dt>
			<dd>
				<a href="https://merylgreendesigns.com">merylgreendesigns.com</a>
			</dd>

			<dt>Email</dt>
			<dd><a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a></dd>

			<dt>Dispute resolution</dt>
			<dd>
				The
				<a href="https://www.cgso.org.za" target="_blank" rel="noopener noreferrer"
					>Consumer Goods and Services Ombud (CGSO)</a>
				is our applicable dispute-resolution forum. See
				"Your statutory rights and dispute resolution" below
				for the consumer's right to elect between CGSO, the
				National Consumer Commission, and the courts.
			</dd>

			<dt>Access to your order record</dt>
			<dd>
				Available on the <a href="/track">track-order page</a>
				using your order reference and email, or by emailing
				us, for 365 days from the order date (after which the
				record holding your personal details is automatically
				deleted &mdash; see the
				<a href="/privacy">Privacy Policy</a> for the full
				retention schedule).
			</dd>
		</dl>
		<p>
			For questions about this policy, an order, or any other matter,
			email or call using the details above.
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

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.92em;
	}

	.business-identity {
		display: grid;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--color-rule);
		border-bottom: 1px solid var(--color-rule);
	}

	.business-identity dt {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-bark);
		margin-top: var(--space-1);
	}

	.business-identity dt:first-child {
		margin-top: 0;
	}

	.business-identity dd {
		margin: 0;
		line-height: 1.6;
		color: var(--color-ink);
	}
</style>

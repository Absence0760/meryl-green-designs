<!--
	Privacy Policy for Meryl Green Designs.

	IMPORTANT: This document describes how the site actually handles data
	today, based on the current architecture (static SvelteKit frontend,
	Hono backend on AWS Lambda, Sanity CMS, Resend for email, PayFast for
	payments). The typeface is self-hosted under static/fonts/ — no
	external font CDN. The document is written to be accurate to those
	data flows rather than generated from a template.

	Phase 1 (current): DynamoDB is the sole store of order PII (name,
	email, phone, address, items, notes, tracking). Sanity stores only
	the non-PII order skeleton (orderRef, status, paymentMethod,
	amountZar, paymentId). The two bullets under "Who we share it with"
	reflect that split. See docs/orders-pii-split-plan.md for the
	migration history.

	Even so, a privacy policy is a legal document. Before going live with
	this under Meryl's name, have it reviewed by a South African legal
	professional who can:
	  - Confirm POPIA wording (responsible party / operator terminology,
	    Information Officer designation per s55) is correct for the
	    business. The IO must also be REGISTERED with the Information
	    Regulator via the online portal — tracked in docs/roadmap.md.
	  - Confirm the cross-border transfer language (Sanity / Resend US,
	    AWS af-south-1 with global control plane) reflects the actually-
	    executed DPAs on Meryl's current plan tier with each provider.
	    Tracked in docs/roadmap.md as a pre-launch DPA-verification task.
	  - Sanity-check the concrete retention windows (365 days on
	    customer-detail rows in DynamoDB via per-item TTL, 30-day
	    backend log retention, 5-year SARS retention for transactional
	    records) against current SARS guidance and the CGSO's
	    reasonable-retention expectations.

	Update the "Last updated" date whenever the data flows or policy
	text change.
-->
<script lang="ts">
	const lastUpdated = 'May 2026';
</script>

<svelte:head>
	<title>Privacy Policy — Meryl Green Designs</title>
	<meta
		name="description"
		content="How Meryl Green Designs collects, uses, and protects your personal information under POPIA."
	/>
	<meta property="og:title" content="Privacy Policy — Meryl Green Designs" />
	<meta
		property="og:description"
		content="How Meryl Green Designs collects, uses, and protects your personal information under POPIA."
	/>
</svelte:head>

<section class="section">
	<div class="container narrow">
		<p class="eyebrow">Legal</p>
		<h1>Privacy Policy</h1>
		<p class="muted">Last updated: {lastUpdated}</p>

		<p class="lede">
			This policy explains what personal information Meryl Green Designs
			collects when you use this website or place an order, how we use
			that information, who we share it with, and the rights you have
			under South Africa's Protection of Personal Information Act
			(POPIA).
		</p>

		<h2>Who we are</h2>
		<p>
			Meryl Green Designs (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a South African studio that sells
			handcrafted screens and designs through this website. For the
			purposes of POPIA, Meryl Green Designs is the
			<strong>responsible party</strong> for the personal information
			collected through this site.
		</p>
		<p>
			Our <strong>Information Officer</strong> under section 55 of
			POPIA is Meryl Green. Requests under POPIA (access, correction,
			deletion, objection) and any complaints about how we handle
			your personal information can be sent to
			<a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>.
			We aim to respond within the 30-day window prescribed by the
			POPIA Regulations.
		</p>
		<p>
			The terms that apply when you place an order, alongside this
			privacy notice, are set out in the
			<a href="/terms">Terms &amp; Conditions</a>.
		</p>

		<h2>Lawful basis for processing</h2>
		<p>
			Under section 11 of POPIA, every act of processing must rest
			on a specific lawful basis. We rely on the following:
		</p>
		<ul>
			<li>
				<strong>Section 11(1)(b) — necessary for the conclusion or
				performance of a contract.</strong> This is our lawful
				basis for processing the information you give us when
				placing an order (name, email, phone, shipping address,
				items). Without it, we cannot fulfil your order. You do
				not need to give separate consent for this processing —
				submitting an order is the act of contracting.
			</li>
			<li>
				<strong>Section 11(1)(f) — legitimate interest.</strong>
				This is our lawful basis for server logs, fraud
				prevention, and basic security telemetry. We balance
				these interests against your rights and use only the
				minimum information needed.
			</li>
			<li>
				<strong>Section 11(1)(c) — compliance with a legal
				obligation.</strong> This is our lawful basis for
				retaining transactional records SARS may require (see
				"How long we keep it" below).
			</li>
		</ul>
		<p>
			We do not rely on consent (section 11(1)(a)) for any of the
			processing this policy describes. If a future feature would
			require consent — for example, a newsletter signup — we will
			collect it explicitly and separately at that point.
		</p>

		<h2>What we collect</h2>
		<p>We collect only the information you give us, or that we need to run the site.</p>

		<h3>When you place an order</h3>
		<ul>
			<li>Your name</li>
			<li>Your email address</li>
			<li>Your phone number (optional)</li>
			<li>Your shipping address</li>
			<li>The items you have ordered</li>
			<li>Any notes you add to your order</li>
		</ul>

		<h3>When you pay for an order</h3>
		<p>
			Payments are handled by <a href="https://www.payfast.co.za"
				target="_blank"
				rel="noopener noreferrer">PayFast</a>. You are redirected to
			PayFast's own hosted payment page to enter your card or payment
			details. <strong>We never see, store, or process your card
			details.</strong> PayFast sends us back only a confirmation that
			payment has been received, along with your order reference.
		</p>

		<h3>When you track an order</h3>
		<p>
			You enter your order reference and the email address you used
			when placing the order. The email is used only to confirm that
			the order belongs to you — we do not store anything new as a
			result of a track-order lookup.
		</p>

		<h3>When you visit the site</h3>
		<p>
			Our hosting provider (Amazon Web Services) automatically logs
			standard technical information for every request, including your
			IP address, the browser you are using, the pages you visit, and
			the date and time. These logs are used for security, for
			diagnosing technical problems, and for basic traffic monitoring.
			We do not use Google Analytics, advertising pixels, or any
			behavioural tracking on this site.
		</p>

		<h2>Why we collect it</h2>
		<p>We only use your personal information for the purposes it was given to us:</p>
		<ul>
			<li>
				<strong>To fulfil your order</strong> — to take payment,
				confirm the order, contact you about it, pack it, ship it,
				and respond to any follow-up questions.
			</li>
			<li>
				<strong>To let you track your order</strong> — to verify
				that an order lookup is being made by the person who placed
				the order.
			</li>
			<li>
				<strong>To operate and secure the website</strong> — server
				logs and standard hosting controls.
			</li>
			<li>
				<strong>To comply with the law</strong> — for example,
				keeping records of sales transactions as required by tax
				and consumer-protection legislation.
			</li>
		</ul>
		<p>
			We will not use your information for marketing, and we will
			not send you newsletters or promotional emails, unless you
			specifically ask us to.
		</p>

		<h2>Who we share it with</h2>
		<p>
			We only share your information with the service providers we
			need to run the site and fulfil orders. Each provider listed
			below acts as an <strong>operator</strong> under POPIA section
			1 and has signed a written data-processing agreement with us
			under POPIA section 21, committing to security safeguards
			substantially similar to those POPIA itself requires.
		</p>
		<ul>
			<li>
				<strong>Sanity</strong> — our content management system.
				Stores only the order skeleton (order reference, status,
				amount, payment method, payment provider ID). Your
				personal details — name, email, phone, address, items,
				notes — are not held in Sanity; they live in our private
				AWS DynamoDB table (see below).
				<a href="https://www.sanity.io/legal/privacy"
					target="_blank"
					rel="noopener noreferrer">Sanity privacy policy</a>
			</li>
			<li>
				<strong>PayFast</strong> — our payment gateway. Receives
				your name, email, order reference, and payment amount.
				Card details go directly to PayFast and never touch our
				servers.
				<a href="https://www.payfast.co.za/privacy-policy/"
					target="_blank"
					rel="noopener noreferrer">PayFast privacy policy</a>
			</li>
			<li>
				<strong>Resend</strong> — our transactional email provider.
				Receives your email address and the contents of order
				confirmation and order-status emails sent to you.
				<a href="https://resend.com/legal/privacy-policy"
					target="_blank"
					rel="noopener noreferrer">Resend privacy policy</a>
			</li>
			<li>
				<strong>Amazon Web Services (AWS)</strong> — our hosting
				provider. Serves the website, runs the backend API, and
				stores your order details (name, email, phone, shipping
				address, items, notes, and any tracking information added
				later) in a private DynamoDB table in the AWS Cape Town
				region. This is the sole record of your personal
				information on our infrastructure. Also retains standard
				application server logs as described in "How long we
				keep it" below.
				<a href="https://aws.amazon.com/privacy/"
					target="_blank"
					rel="noopener noreferrer">AWS privacy notice</a>
			</li>
		</ul>
		<p>
			We do not sell your personal information to anyone, and we do
			not share it with advertisers. The site does not load fonts,
			scripts, or analytics from third-party CDNs; the typeface is
			served from our own infrastructure, so your browser does not
			make any background calls to Google or similar providers
			while you visit the site.
		</p>

		<h2>Cross-border transfers</h2>
		<p>
			Of the operators above, <strong>Sanity</strong> (United States)
			and <strong>Resend</strong> (United States) are located outside
			South Africa, and <strong>Amazon Web Services</strong> stores
			your order data primarily in the AWS Cape Town (af-south-1)
			region but operates global control-plane services that may be
			accessed from other AWS regions. <strong>PayFast</strong>
			operates from South Africa.
		</p>
		<p>
			Where personal information is transferred across borders, we
			rely on the following bases under section 72 of POPIA:
		</p>
		<ul>
			<li>
				<strong>Section 72(1)(b) — adequate protections in
				binding agreements.</strong> Each non-SA operator has
				agreed in its data-processing terms to protections
				substantially similar to those required by POPIA's
				Conditions 7 and 8 (security safeguards, data-subject
				participation). These are the Sanity DPA, the Resend
				DPA, and the AWS GDPR Data Processing Addendum, all of
				which incorporate Standard Contractual Clauses.
			</li>
			<li>
				<strong>Section 72(1)(a) — consent.</strong> By submitting
				an order, you consent to the limited cross-border transfer
				described above, as necessary to fulfil your order. You
				may withdraw consent by emailing us, but withdrawing
				consent will also prevent us from completing your order.
			</li>
		</ul>

		<h2>How long we keep it</h2>
		<p>
			<strong>Customer details</strong> (your name, email address,
			phone number, shipping address, items, and any notes you sent
			us) are kept for <strong>365 days</strong> (about 12 months)
			from when you placed the order. After that window, AWS
			DynamoDB automatically deletes the entire record holding
			your details via a per-row expiry timer set when the order
			is created. This deletion happens at the storage layer, not
			via a scheduled job — there is no separate sweep that
			could fail or be paused.
		</p>
		<p>
			We retain the order reference, status, amount, and payment
			method indefinitely on a separate database for accounting
			and audit purposes — none of those identify you personally.
		</p>
		<p>
			While your order is still being processed (within the first
			365 days), we keep the full details so we can complete
			fulfilment and respond to questions about your order.
		</p>
		<p>
			Application logs from our serverless backend are retained
			for <strong>30 days</strong>. We do not currently capture
			access logs from CloudFront or S3, so the only PII that
			survives in logs at all is whatever IP address and
			user-agent your browser supplied when calling our backend
			APIs. Email records are retained by Resend (our email
			provider) according to their own retention policy.
		</p>
		<p>
			If you ask us to delete your information sooner than the
			365-day window, we will delete what is not required by law
			to be kept. Statutory record-keeping (e.g. tax invoices) may
			oblige us to retain certain transactional details for up to
			5 years under SARS rules, even after a deletion request.
		</p>

		<h2>How we protect it</h2>
		<ul>
			<li>All traffic to this site is encrypted in transit using HTTPS.</li>
			<li>
				Card payments are processed by PayFast on their own
				infrastructure; we never handle card data.
			</li>
			<li>
				Access to the content management system and to backend
				services is restricted to authorised operators.
			</li>
			<li>
				Secrets and credentials are encrypted at rest and not
				committed to source control.
			</li>
		</ul>

		<h2>Cookies and tracking</h2>
		<p>
			This website does <strong>not</strong> use cookies for tracking
			or advertising. It does not use Google Analytics, Facebook
			pixels, or any comparable behavioural-tracking tools. Your
			cart is held in memory while you browse and is cleared when
			you close the tab or refresh the page — we do not store it
			on your device or on our servers.
		</p>

		<h2>Your rights under POPIA</h2>
		<p>As a data subject, you have the right to:</p>
		<ul>
			<li>
				<strong>Access</strong> — ask us what personal information
				we hold about you.
			</li>
			<li>
				<strong>Correct</strong> — ask us to correct or update any
				inaccurate information we hold.
			</li>
			<li>
				<strong>Delete</strong> — ask us to delete your
				information, subject to any legal obligation we have to
				retain it.
			</li>
			<li>
				<strong>Object</strong> — object to any processing of your
				information you consider unlawful or unjustified.
			</li>
			<li>
				<strong>Complain</strong> — lodge a complaint with the
				Information Regulator of South Africa if you believe your
				rights have been infringed.
				<a href="https://inforegulator.org.za"
					target="_blank"
					rel="noopener noreferrer">inforegulator.org.za</a>
			</li>
		</ul>
		<p>
			Requests under POPIA may be made informally by emailing
			<a href="mailto:zagreenwoman@gmail.com">zagreenwoman@gmail.com</a>,
			or formally on the Information Regulator's prescribed
			<strong>Form 2</strong> (access requests under section 23) or
			<strong>Form 3</strong> (correction or deletion under section
			24), both available at
			<a href="https://inforegulator.org.za"
				target="_blank"
				rel="noopener noreferrer">inforegulator.org.za</a>.
			We will acknowledge your request promptly and respond within
			the 30-day window prescribed by the POPIA Regulations.
		</p>

		<h2>Children</h2>
		<p>
			This site is not directed at children, and we do not knowingly
			collect personal information from children under the age of 18.
		</p>

		<h2>Changes to this policy</h2>
		<p>
			We may update this policy from time to time, for example when
			we add a new service provider or change the way we handle
			orders. The &ldquo;Last updated&rdquo; date at the top of this
			page will always reflect the most recent revision. Material
			changes will be flagged on the site.
		</p>

		<h2>Contact us</h2>
		<p>
			For any questions about this policy, or to exercise your
			rights, please email
			<a href="mailto:zagreenwoman@gmail.com"
				>zagreenwoman@gmail.com</a>.
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

	h3 {
		font-size: 1.1rem;
		margin-top: var(--space-2);
		margin-bottom: var(--space-1);
		font-family: var(--font-display);
		color: var(--color-leaf-dark);
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

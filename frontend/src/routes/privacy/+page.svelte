<!--
	Privacy Policy for Meryl Green Designs.

	IMPORTANT: This document describes how the site actually handles data
	today, based on the current architecture (static SvelteKit frontend,
	Hono backend on AWS Lambda, Sanity CMS, Resend for email, PayFast for
	payments, Google Fonts for typography). It is written to be accurate
	to those data flows rather than generated from a template.

	Even so, a privacy policy is a legal document. Before going live with
	this under Meryl's name, have it reviewed by a South African legal
	professional who can:
	  - Confirm POPIA wording (responsible party / operator terminology,
	    information officer designation) is correct for the business.
	  - Advise on cross-border transfer language (Sanity, Resend, AWS,
	    Google are all outside South Africa).
	  - Advise on retention periods — currently left deliberately broad
	    because the business hasn't defined them.

	Update the "Last updated" date whenever the data flows or policy
	text change.
-->
<script lang="ts">
	const lastUpdated = 'April 2026';
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
	<meta name="robots" content="noindex" />
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
			If you have any questions about this policy, or you want to
			exercise any of the rights described below, please email
			<a href="mailto:zagreenwoman@gmail.com"
				>zagreenwoman@gmail.com</a
			>.
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
			need to run the site and fulfil orders. Each of these
			providers is contractually required to protect your data and
			to use it only for the purpose we have engaged them for.
		</p>
		<ul>
			<li>
				<strong>Sanity</strong> — our content management system.
				Stores your order (name, email, phone, address, items,
				notes, status).
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
				provider. Handles website traffic and serves the backend
				API; retains standard server logs.
				<a href="https://aws.amazon.com/privacy/"
					target="_blank"
					rel="noopener noreferrer">AWS privacy notice</a>
			</li>
			<li>
				<strong>Google Fonts</strong> — supplies the typeface used
				on the site. When your browser loads the font, Google may
				log your IP address and user agent.
				<a href="https://policies.google.com/privacy"
					target="_blank"
					rel="noopener noreferrer">Google privacy policy</a>
			</li>
		</ul>
		<p>
			Some of these providers are located outside South Africa.
			Where personal information is transferred across borders, we
			rely on the provider's own safeguards (for example, standard
			contractual clauses or equivalent protections) in line with
			section 72 of POPIA.
		</p>
		<p>
			We do not sell your personal information to anyone, and we do
			not share it with advertisers.
		</p>

		<h2>How long we keep it</h2>
		<p>
			<strong>Customer details on completed orders</strong> (your
			name, email address, phone number, shipping address, and any
			notes you sent us) are kept for <strong>12 months</strong>
			after an order reaches a final state — either delivered or
			cancelled. After 12 months, those personal details are
			automatically removed from our records by a scheduled cleanup
			job. We retain the order reference, status, amount, and
			payment method indefinitely for accounting and audit
			purposes — none of those identify you personally.
		</p>
		<p>
			While an order is still in progress (pending payment, payment
			received, shipped), we keep the full details so we can
			complete the fulfilment and respond to questions.
		</p>
		<p>
			Server logs are retained for 30 days at our hosting
			provider's default. Email records are retained by Resend
			(our email provider) according to their own policy.
		</p>
		<p>
			If you ask us to delete your information sooner than the
			12-month window, we will delete what is not required by law
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
			To exercise any of these rights, email
			<a href="mailto:zagreenwoman@gmail.com"
				>zagreenwoman@gmail.com</a>. We will respond within
			30 days.
		</p>

		<h2>Rights for visitors outside South Africa</h2>
		<p>
			If you are a resident of the European Economic Area or the
			United Kingdom, you have additional rights under the GDPR —
			including the right to data portability and the right to
			restrict processing. These are available on request by email.
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

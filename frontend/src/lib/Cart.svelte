<script lang="ts">
	import { cart } from './cartStore.svelte';
	import { formatPrice } from './sanity';
	import { PUBLIC_API_URL } from '$env/static/public';
	import PayFastRedirecting from './PayFastRedirecting.svelte';
	import Button from './Button.svelte';

	export let open = false;
	export let onclose: () => void;

	let name = '';
	let email = '';
	let phone = '';
	let address = '';
	let notes = '';
	let website = '';
	// Clickwrap acceptance — the Terms (/terms) tell the customer that
	// ticking this box is the act of agreement, so the box must default
	// to unchecked and the submit must be gated on it. CPA s49 prefers
	// affirmative clickwrap over implied browsewrap for material terms.
	let acceptedTerms = false;
	let submitting = false;
	let redirecting = false;
	let error: string | null = null;
	// True when `error` was set by client-side field validation (so it
	// should auto-clear once the user fixes the inputs). False when the
	// backend / network failed — those errors must stay visible until
	// the next submit attempt, because clearing them on a keystroke
	// would hide the failure the user is reacting to.
	let errorIsValidation = false;

	const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	$: requiredFieldsValid =
		name.trim() !== '' &&
		email.trim() !== '' &&
		address.trim() !== '' &&
		emailRe.test(email) &&
		acceptedTerms;

	// Auto-clear validation errors as soon as the form becomes valid,
	// so a "please fill in X" message disappears once the user has
	// filled in X — they don't need to click Pay again just to silence
	// a notice that's already addressed.
	$: if (error && errorIsValidation && requiredFieldsValid) {
		error = null;
		errorIsValidation = false;
	}

	// `cart` comes from cartStore.svelte.ts (Svelte 5 runes); this
	// component is in legacy mode (uses `export let`). Svelte 4 `$:`
	// blocks track local `let` reassignments at compile time and do
	// NOT auto-wire to imported rune-store reads, so a `$: if
	// (cart.items.length === 0)` watcher would only fire once at
	// mount, not when the cart actually empties. Reset state inline
	// at every action point that can drain the cart instead.
	function resetIfCartEmpty() {
		// CPA s49 hygiene: a fresh "transaction" starts with no accepted
		// terms and no leftover error from the previous one.
		if (cart.items.length === 0) {
			error = null;
			errorIsValidation = false;
			acceptedTerms = false;
		}
	}

	function handleRemove(productId: string) {
		cart.remove(productId);
		resetIfCartEmpty();
	}

	// cartLogic.decrementItem auto-removes at qty 0, so the `-` button
	// is a second path to an empty cart (decrement on a qty-1 item).
	// Without this wrapper, that path leaves acceptedTerms + stale
	// errors in place — same bug as the missing-remove case.
	function handleDecrement(productId: string) {
		cart.decrement(productId);
		resetIfCartEmpty();
	}

	function handleBrowseShop() {
		// Close the cart panel so the SPA navigation to /shop is unobscured.
		onclose();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function redirectToPayFast(payfast: { action: string; fields: Record<string, string> }) {
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = payfast.action;
		for (const [fieldName, value] of Object.entries(payfast.fields)) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = fieldName;
			input.value = value;
			form.appendChild(input);
		}
		document.body.appendChild(form);
		form.submit();
	}

	async function handleCheckout() {
		if (cart.items.length === 0) return;
		if (!name.trim() || !email.trim() || !address.trim()) {
			error = 'Please fill in your name, email, and shipping address.';
			errorIsValidation = true;
			return;
		}
		if (!emailRe.test(email)) {
			error = 'Please enter a valid email address.';
			errorIsValidation = true;
			return;
		}
		if (!acceptedTerms) {
			error =
				'Please confirm you have read and accepted the Terms, Refund & Returns Policy, and Privacy Policy.';
			errorIsValidation = true;
			return;
		}

		submitting = true;
		error = null;
		errorIsValidation = false;

		const body = {
			name: name.trim(),
			email: email.trim(),
			phone: phone.trim(),
			address: address.trim(),
			notes: notes.trim(),
			website,
			paymentMethod: 'payfast',
			cart: cart.items.map((item) => ({
				productId: item.productId,
				quantity: item.quantity
			}))
		};

		try {
			const res = await fetch(`${PUBLIC_API_URL}/orders`, {
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
				errorIsValidation = false;
				return;
			}

			if (data.payfast) {
				redirecting = true;
				cart.clear();
				// Same hygiene rule applies here as it does to remove +
				// decrement-to-0: when the cart drains, the next
				// transaction should start clean. In the happy path the
				// PayFast redirect navigates away immediately and this
				// state is never re-read. The defensive value is the
				// failure-mode where the redirect doesn't fire — the
				// user closes the panel, adds new items, reopens, and
				// shouldn't see leftover acceptedTerms from the
				// previous attempt.
				resetIfCartEmpty();
				redirectToPayFast(data.payfast);
				return;
			}
		} catch (e) {
			console.error(e);
			error = 'Could not reach the order service. Please try again.';
			errorIsValidation = false;
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div class="backdrop" on:click={handleBackdropClick}>
		<aside class="panel">
			<header class="panel-header">
				<h2>Your order</h2>
				<button class="close-btn" on:click={onclose} aria-label="Close cart">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</header>

			{#if redirecting}
				<div class="redirecting-wrap">
					<PayFastRedirecting />
				</div>
			{:else if cart.items.length === 0}
				<div class="empty">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
						<circle cx="9" cy="21" r="1"></circle>
						<circle cx="20" cy="21" r="1"></circle>
						<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
					</svg>
					<p>Your cart is empty</p>
					<p class="empty-hint">Add items from the shop to get started.</p>
					<div class="empty-cta">
						<Button href="/shop" variant="outlined" size="sm" on:click={handleBrowseShop}>
							Browse shop
						</Button>
					</div>
				</div>
			{:else}
				<div class="items">
					{#each cart.items as item (item.productId)}
						<div class="item">
							<div class="item-info">
								<span class="item-name">{item.name}</span>
							</div>
							<div class="item-controls">
								<button class="qty-btn" on:click={() => handleDecrement(item.productId)} aria-label="Decrease quantity">&minus;</button>
								<span class="qty">{item.quantity}</span>
								<button class="qty-btn" on:click={() => cart.increment(item.productId)} aria-label="Increase quantity">+</button>
							</div>
							<span class="item-price">{formatPrice(item.price * item.quantity)}</span>
							<button class="remove-btn" on:click={() => handleRemove(item.productId)} aria-label="Remove {item.name}">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
									<line x1="18" y1="6" x2="6" y2="18"></line>
									<line x1="6" y1="6" x2="18" y2="18"></line>
								</svg>
							</button>
						</div>
					{/each}
				</div>

				<div class="form">
					{#if error}
						<div class="form-error">{error}</div>
					{/if}

					<input
						type="text"
						name="website"
						tabindex="-1"
						autocomplete="off"
						class="hp"
						aria-hidden="true"
						bind:value={website}
					/>

					<label for="cart-name">Name <span class="req">*</span></label>
					<input id="cart-name" type="text" autocomplete="name" required bind:value={name} />

					<label for="cart-email">Email <span class="req">*</span></label>
					<input id="cart-email" type="email" autocomplete="email" inputmode="email" required bind:value={email} />

					<label for="cart-phone">Phone <span class="optional">(optional)</span></label>
					<input id="cart-phone" type="tel" autocomplete="tel" inputmode="tel" bind:value={phone} />

					<label for="cart-address">Shipping address <span class="req">*</span></label>
					<textarea id="cart-address" rows="2" autocomplete="street-address" required bind:value={address}></textarea>

					<label for="cart-notes">Notes <span class="optional">(optional)</span></label>
					<textarea id="cart-notes" rows="3" placeholder="Any special requests…" bind:value={notes}></textarea>
				</div>

				<div class="panel-footer">
					<div class="total-row">
						<span>Total</span>
						<span class="total-amount">{formatPrice(cart.total)}</span>
					</div>
					<label class="terms-accept" for="cart-terms">
						<input
							id="cart-terms"
							type="checkbox"
							required
							bind:checked={acceptedTerms}
						/>
						<span>
							<strong>I have read and accept</strong> the
							<a href="/terms" target="_blank" rel="noopener">Terms</a>,
							<a href="/returns" target="_blank" rel="noopener">Refund &amp; Returns Policy</a>,
							and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
							<span class="req">*</span>
						</span>
					</label>
					<button
						class="checkout-btn"
						on:click={handleCheckout}
						disabled={submitting || !acceptedTerms}
					>
						{#if submitting}
							Processing…
						{:else}
							Pay now — {formatPrice(cart.total)}
						{/if}
					</button>
					<p class="hint">
						{#if acceptedTerms}
							You'll be redirected to PayFast to complete payment securely.
						{:else}
							Tick the box above to confirm the Terms before paying.
						{/if}
					</p>
				</div>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
		display: flex;
		justify-content: flex-end;
	}

	/* Page-local warn token. Co-located rather than added to app.css —
	   this red shows up only in cart validation surfaces (required
	   marker, remove-hover, form error). Matches the muted brick used
	   site-wide for errors / required indicators. */
	.panel {
		--color-warn: #a2432f;
		--color-warn-soft: #f5e3e0;
		--color-warn-ink: #6b2a1b;

		background: var(--color-bg);
		border-left: 1px solid var(--color-rule);
		width: min(420px, 100vw);
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: 0 0 var(--space-3);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-rule);
		position: sticky;
		top: 0;
		background: var(--color-bg);
		z-index: 1;
	}

	.panel-header h2 {
		font-size: 1.25rem;
		font-weight: 500;
		margin: 0;
		font-family: var(--font-display);
		color: var(--color-leaf-dark);
		letter-spacing: 0.01em;
	}

	.close-btn {
		background: none;
		border: 1px solid transparent;
		color: var(--color-ink-soft);
		padding: var(--space-1);
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s, border-color 0.15s;
	}

	.close-btn:hover {
		color: var(--color-ink);
	}

	.close-btn:focus-visible {
		outline: 2px solid var(--color-leaf);
		outline-offset: 2px;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		color: var(--color-ink-soft);
		padding: var(--space-5) var(--space-3);
		font-size: 0.9rem;
		text-align: center;
	}

	.empty p { margin: 0; }

	.empty-cta {
		margin-top: var(--space-2);
	}

	/* Cart panel sizes to content now; min-height gives the spinner
	   enough vertical real estate to sit centred and read as a
	   primary state, not a footer. The shared component owns its
	   own padding + spinner styles. */
	.redirecting-wrap {
		min-height: 40vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.empty-hint {
		font-size: 0.8rem;
		color: var(--color-ink-soft);
	}

	.items {
		padding: var(--space-2) var(--space-3) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.item {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		align-items: center;
		gap: var(--space-1);
		padding: 0.6rem var(--space-2);
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
	}

	.item-info {
		min-width: 0;
	}

	.item-name {
		font-size: 0.85rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.item-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.qty-btn {
		width: 26px;
		height: 26px;
		border-radius: 2px;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		color: var(--color-ink);
		font-size: 1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
		padding: 0;
	}

	.qty-btn:hover {
		border-color: var(--color-leaf);
		color: var(--color-leaf-dark);
	}

	.qty-btn:focus-visible {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.qty {
		font-size: 0.85rem;
		min-width: 18px;
		text-align: center;
		font-weight: 600;
	}

	.item-price {
		font-size: 0.9rem;
		font-weight: 600;
		font-family: var(--font-display);
		color: var(--color-leaf-dark);
		min-width: 52px;
		text-align: right;
	}

	.remove-btn {
		background: none;
		border: 1px solid transparent;
		color: var(--color-ink-soft);
		padding: 3px;
		border-radius: 2px;
		cursor: pointer;
		transition: color 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-btn:hover {
		color: var(--color-warn);
	}

	.remove-btn:focus-visible {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	/* Bottom-anchored footer with summary + CTA, the standard slide-out
	   cart pattern (Shopify, Stripe Checkout, most e-commerce shells).
	   margin-top: auto pushes it to the bottom of the panel's flex
	   column regardless of how much form / items content is above. The
	   footer owns the horizontal padding so the CTA inside can run
	   edge-to-edge of the inner content area without per-element
	   margin bookkeeping. */
	.panel-footer {
		margin-top: auto;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--color-rule);
		background: var(--color-bg);
	}

	.total-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0 0 var(--space-2);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-soft);
	}

	.total-amount {
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 500;
		letter-spacing: 0.01em;
		text-transform: none;
		color: var(--color-leaf-dark);
	}

	.form {
		padding: 0 var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-soft);
		margin-top: 6px;
	}

	.req { color: var(--color-warn); font-weight: 700; }
	.optional { font-weight: 400; text-transform: none; letter-spacing: 0; font-style: italic; }

	.form input,
	.form textarea {
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 2px;
		color: var(--color-ink);
		padding: 8px 10px;
		font: inherit;
		font-size: 0.85rem;
		width: 100%;
		box-sizing: border-box;
		transition: border-color 0.15s;
		resize: vertical;
	}

	.form input:focus,
	.form textarea:focus {
		outline: 2px solid var(--color-leaf);
		outline-offset: 1px;
	}

	.form-error {
		background: var(--color-warn-soft);
		border-left: 4px solid var(--color-warn);
		color: var(--color-warn-ink);
		padding: var(--space-1) var(--space-2);
		font-size: 0.85rem;
		border-radius: 2px;
	}

	/* CPA s49 wants this clause "conspicuous" — not just present and
	   ticked-to-proceed. Calls it out as a bordered cream block above
	   the Pay button rather than letting it sit as another field-style
	   row. Logic guards (button-disable + handleCheckout early-return)
	   live above in the script; don't weaken them when tweaking visuals. */
	.terms-accept {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 0 0 var(--space-2);
		padding: var(--space-2);
		background: var(--color-surface);
		border: 1px solid var(--color-rule);
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--color-ink);
		line-height: 1.5;
		cursor: pointer;
	}

	.terms-accept input[type='checkbox'] {
		flex-shrink: 0;
		margin-top: 1px;
		width: 16px;
		height: 16px;
		accent-color: var(--color-leaf-dark);
	}

	.terms-accept strong {
		font-weight: 600;
		color: var(--color-leaf-dark);
	}

	.terms-accept a {
		color: var(--color-leaf-dark);
		text-decoration: underline;
	}

	.terms-accept a:hover {
		text-decoration: none;
	}

	.hp {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	/* Inline button (not Button.svelte) because it carries cart-specific
	   dynamic state — disabled gates on submitting OR !acceptedTerms (the
	   safety-critical clickwrap guard), and the label flips between
	   "Processing…" and "Pay now — Rxxx". Shares typographic treatment
	   with Button.svelte's --primary variant so the visual reads
	   consistently across the site. */
	.checkout-btn {
		/* Edge-to-edge inside the footer's padding (no per-button margin
		   bookkeeping). The footer owns the horizontal rhythm. */
		display: flex;
		width: 100%;
		margin: 0;
		background: var(--color-leaf-dark);
		color: var(--color-bg);
		border: 1px solid var(--color-leaf-dark);
		border-radius: 4px;
		padding: 0.75rem var(--space-2);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.checkout-btn:hover {
		background: var(--color-bark);
		border-color: var(--color-bark);
	}

	.checkout-btn:focus-visible {
		outline: 2px solid var(--color-leaf);
		outline-offset: 2px;
	}

	.checkout-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.hint {
		text-align: center;
		font-size: 0.75rem;
		color: var(--color-ink-soft);
		margin: var(--space-1) 0 0;
	}
</style>

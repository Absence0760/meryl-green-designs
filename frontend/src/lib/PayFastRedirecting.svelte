<!--
  Centred-spinner state shown after the backend has handed back
  signed PayFast form data and the browser is about to navigate
  cross-origin to sandbox.payfast.co.za. Used by every surface
  that POSTs to PayFast: the cart-checkout (Cart.svelte), the
  cancelled-payment retry form (routes/payment/cancelled), and
  the in-window retry CTA on /track.

  Stays presentation-only — the consumer decides when to render
  it (typically after the POST succeeds and just before invoking
  the form-submit helper).
-->

<div class="redirecting" role="status" aria-live="polite">
	<div class="spinner" aria-hidden="true"></div>
	<p class="redirecting__title">Redirecting to PayFast…</p>
	<p class="redirecting__hint">Complete your payment on the next page.</p>
</div>

<style>
	.redirecting {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 48px 20px;
		color: var(--color-ink-soft);
		font-size: 0.9rem;
		text-align: center;
	}

	.redirecting__title,
	.redirecting__hint {
		margin: 0;
	}

	.redirecting__hint {
		font-size: 0.8rem;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-rule);
		border-top-color: var(--color-leaf-dark);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 8px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>

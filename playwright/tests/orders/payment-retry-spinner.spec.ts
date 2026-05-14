import { test, expect, type Page } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';

// Browser-level UX assertion: after the retry POST resolves, the
// three retry-payment surfaces (cart-checkout, /payment/cancelled,
// /track) must swap their CTA for the shared PayFastRedirecting
// spinner BEFORE the cross-origin navigation lands. Without it, a
// slow PayFast redirect looks identical to a hung click.
//
// To freeze the page in the post-redirect-decision state we stub
// HTMLFormElement.prototype.submit before navigation: when the
// component's submitToPayFast() helper calls form.submit(), we
// no-op for PayFast actions. The Svelte state update that flipped
// `redirecting = true` still flushes and the spinner DOM renders,
// but no cross-origin navigation happens, so the page stays mounted
// for the assertion. Other forms (e.g. cart Pay-now or login forms)
// still submit normally because the stub gates on the form's action.
//
// Route-level aborts blank the viewport in Chromium (the failed
// navigation clears the page) and delayed-fulfill route handlers
// deadlock expect().toBeVisible(), which auto-waits for any
// in-flight navigation. Stubbing the DOM submit avoids both pitfalls.

async function stubPayFastSubmit(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const origSubmit = HTMLFormElement.prototype.submit;
		HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
			if (this.action.includes('sandbox.payfast.co.za')) {
				(window as unknown as { __payfastSubmittedAction?: string }).__payfastSubmittedAction =
					this.action;
				return;
			}
			return origSubmit.call(this);
		};
	});
}

test.describe('redirecting indicator on retry surfaces', () => {
	// addInitScript only runs on documents loaded AFTER it's registered,
	// so the stub must be installed before any page.goto() in the test
	// body. beforeEach handles every spec uniformly.
	test.beforeEach(async ({ page }) => {
		await stubPayFastSubmit(page);
	});

	test('cart checkout shows "Redirecting to PayFast…" before navigating', async ({
		page,
	}) => {
		await page.goto('/shop');
		await expect(page.getByText('Test Screen Small')).toBeVisible();
		await page.getByRole('button', { name: /add to order/i }).first().click();
		await page.getByRole('button', { name: 'Open cart' }).click();

		await page.fill('#cart-name', 'Spinner Customer');
		await page.fill('#cart-email', 'spinner-cart@e2e.local');
		await page.fill('#cart-address', '1 Test Lane');
		await page.check('#cart-terms');

		await page.getByRole('button', { name: /pay/i }).click();

		// Form-submit to PayFast aborts, leaving the cart panel mounted
		// with the shared spinner block in place of the order form.
		await expect(page.getByText(/redirecting to payfast/i)).toBeVisible({
			timeout: 10_000,
		});
		await expect(
			page.getByText(/complete your payment on the next page/i),
		).toBeVisible();
	});

	test('/payment/cancelled retry swaps the form for the spinner', async ({
		page,
		request,
	}) => {
		const order = await placeOrder(request, { email: 'spinner-cancelled@e2e.local' });

		await page.goto(`/payment/cancelled?ref=${encodeURIComponent(order.orderRef)}`);
		// Pre-condition: the form is visible, the spinner is not.
		await expect(page.getByRole('heading', { name: /payment cancelled/i })).toBeVisible();
		await expect(page.getByText(/redirecting to payfast/i)).toBeHidden();

		await page.getByLabel('Email').fill('spinner-cancelled@e2e.local');
		await page.getByRole('button', { name: /retry payment/i }).click();

		// Form is unmounted and the spinner block is rendered.
		await expect(page.getByText(/redirecting to payfast/i)).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByLabel('Email')).toBeHidden();
	});

	test('/track retry section swaps to the spinner', async ({ page, request }) => {
		const order = await placeOrder(request, { email: 'spinner-track@e2e.local' });

		// /track auto-runs the lookup when ?ref=&email= are both in the URL.
		await page.goto(
			`/track?ref=${encodeURIComponent(order.orderRef)}&email=${encodeURIComponent('spinner-track@e2e.local')}`,
		);
		// Wait for the lookup to complete and the retry CTA to render.
		const retryCta = page.getByRole('button', { name: /retry payment/i });
		await expect(retryCta).toBeVisible();

		await retryCta.click();

		// Retry CTA gone, shared spinner in its place.
		await expect(page.getByText(/redirecting to payfast/i)).toBeVisible({
			timeout: 10_000,
		});
		await expect(retryCta).toBeHidden();
	});
});

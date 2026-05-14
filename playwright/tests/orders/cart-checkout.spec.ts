import { test, expect } from '@playwright/test';
import { getOrderPii } from '../../helpers/dynamo-orders.ts';
import { getSanityOrder } from '../../helpers/seed-sanity.ts';
import { clearCapturedEmails, waitForEmail } from '../../helpers/read-email.ts';

// End-to-end checkout: add a product, fill the form, submit, intercept
// PayFast redirect. Verifies the full dual-write: DynamoDB PII row +
// Sanity skeleton + owner notification email + signed PayFast form.
//
// PayFast's hosted page is intercepted via page.route() — we never
// actually navigate to sandbox.payfast.co.za. The signature itself is
// covered by backend/src/__tests__/payfast.test.ts; here we only check
// the form was correctly POSTed in the first place.

test.describe('cart + checkout', () => {
	test.beforeEach(async () => {
		await clearCapturedEmails();
	});

	test('add to cart, check out, dual-write + email + signed form', async ({ page }) => {
		const intercepted: { url: string; postData: string | null } = { url: '', postData: null };

		// Capture the auto-submitted form to sandbox.payfast.co.za and abort
		// the navigation so CI doesn't hit an external service.
		await page.route(/.*sandbox\.payfast\.co\.za.*/, (route) => {
			intercepted.url = route.request().url();
			intercepted.postData = route.request().postData();
			return route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<html><body>Stubbed sandbox PayFast page</body></html>',
			});
		});

		await page.goto('/shop');
		await expect(page.getByText('Test Screen Small')).toBeVisible();

		// Add the small + the large product
		await page.getByRole('button', { name: /add to order/i }).nth(0).click();
		await page.getByRole('button', { name: /add to order/i }).nth(1).click();

		// Open the cart panel — 'Add to order' adds the item but doesn't
		// auto-open the slide-out.
		await page.getByRole('button', { name: /open cart/i }).click();

		// Fill the form inside the cart panel
		await page.fill('#cart-name', 'E2E Customer');
		await page.fill('#cart-email', 'customer@e2e.local');
		await page.fill('#cart-phone', '0821234567');
		await page.fill('#cart-address', '1 Test Lane, Cape Town, 8001');
		await page.check('#cart-terms');

		await page.getByRole('button', { name: /pay/i }).click();

		// Wait for the redirect interception to fire
		await expect.poll(() => intercepted.url, { timeout: 10_000 }).toContain('sandbox.payfast.co.za');
		expect(intercepted.postData).toBeTruthy();
		expect(intercepted.postData!).toContain('m_payment_id=MG-');
		expect(intercepted.postData!).toContain('signature=');
		expect(intercepted.postData!).toMatch(/amount=4600\.00/); // 1200 + 3400

		const formBody = new URLSearchParams(intercepted.postData ?? '');
		const orderRef = formBody.get('m_payment_id')!;
		expect(orderRef).toMatch(/^MG-\d{6}-[A-Z0-9]{6}$/);
		expect(formBody.get('merchant_id')).toBe(process.env.PAYFAST_MERCHANT_ID);
		expect(formBody.get('email_address')).toBe('customer@e2e.local');

		// DynamoDB has the PII row
		const dynRow = await getOrderPii(orderRef);
		expect(dynRow).not.toBeNull();
		expect(dynRow!.customerName).toBe('E2E Customer');
		expect(dynRow!.customerEmail).toBe('customer@e2e.local');
		expect(dynRow!.customerPhone).toBe('0821234567');
		expect(dynRow!.shippingAddress).toBe('1 Test Lane, Cape Town, 8001');
		expect(Array.isArray(dynRow!.items)).toBe(true);
		expect((dynRow!.items as unknown[]).length).toBe(2);

		// Sanity has the skeleton with no PII
		const sanityDoc = await getSanityOrder(orderRef);
		expect(sanityDoc).not.toBeNull();
		expect(sanityDoc!.status).toBe('pending_payment');
		expect(sanityDoc!.paymentMethod).toBe('payfast');
		expect(sanityDoc!.amountZar).toBe(4600);
		expect(sanityDoc!.customerName).toBeUndefined();
		expect(sanityDoc!.customerEmail).toBeUndefined();
		expect(sanityDoc!.shippingAddress).toBeUndefined();

		// Owner notification email captured (no real Resend call)
		const ownerEmails = await waitForEmail(
			(e) => e.to === process.env.OWNER_EMAIL && e.subject.includes(orderRef),
		);
		expect(ownerEmails).toHaveLength(1);
		expect(ownerEmails[0].bodyHtml).toContain('customer@e2e.local');
		expect(ownerEmails[0].bodyHtml).toContain('E2E Customer');
	});

	test('cart quantity controls update the total live', async ({ page }) => {
		await page.goto('/shop');
		await page.getByRole('button', { name: /add to order/i }).first().click();
		await page.getByRole('button', { name: /open cart/i }).click();
		await expect(page.getByText(/total/i)).toBeVisible();
		await page.getByRole('button', { name: /increase quantity/i }).click();
		// Two units of the first product (1200 each) = 2400
		await expect(page.getByText(/R\s*2\s*400/)).toBeVisible();
	});

	test('cart empty state shows when nothing is added', async ({ page }) => {
		await page.goto('/shop');
		// Wait for the shop to hydrate so the Open-cart click reaches the
		// reactive handler (the button renders in the static shell, but
		// the click listener isn't bound until after hydration).
		await expect(page.getByText('Test Screen Small')).toBeVisible();
		await page.getByRole('button', { name: 'Open cart' }).click();
		await expect(page.getByText(/your cart is empty/i)).toBeVisible();
	});

	test('terms checkbox gates submit', async ({ page }) => {
		await page.goto('/shop');
		await page.getByRole('button', { name: /add to order/i }).first().click();
		await page.getByRole('button', { name: /open cart/i }).click();
		await page.fill('#cart-name', 'E2E Customer');
		await page.fill('#cart-email', 'customer@e2e.local');
		await page.fill('#cart-address', '1 Test Lane');
		// Don't tick the terms checkbox
		const payBtn = page.getByRole('button', { name: /pay/i });
		await expect(payBtn).toBeDisabled();
	});
});

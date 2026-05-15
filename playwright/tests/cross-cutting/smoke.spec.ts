import { test, expect } from '@playwright/test';

// Smoke coverage for every public-facing page. Confirms the page
// shell renders, the heading is correct, and there are no console
// errors on load. Fast — runs in a handful of seconds.

const consoleSink = (page: import('@playwright/test').Page, errors: string[]) => {
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
	});
};

test.describe('public pages render', () => {
	test('home page', async ({ page }) => {
		const errs: string[] = [];
		consoleSink(page, errs);
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		// Testimonial seed fixture should land in the home page testimonials band
		await expect(page.getByText('E2E Test Customer')).toBeVisible();
		expect(errs).toEqual([]);
	});

	test('gallery page', async ({ page }) => {
		const errs: string[] = [];
		consoleSink(page, errs);
		await page.goto('/gallery');
		// The H1 is "Styles you can commission" — copy doesn't include
		// the word "gallery". Identity is pinned by the URL + the seeded
		// caption assertion below; just confirm there's an H1.
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		// Visible gallery photos render their captions; hidden one must not
		await expect(page.getByText('E2E gallery photo one')).toBeVisible();
		await expect(page.getByText('Hidden — should not render')).toHaveCount(0);
		expect(errs).toEqual([]);
	});

	test('shop page with seeded products', async ({ page }) => {
		const errs: string[] = [];
		consoleSink(page, errs);
		await page.goto('/shop');
		await expect(page.getByRole('heading', { name: /finished products/i })).toBeVisible();
		await expect(page.getByText('Test Screen Small')).toBeVisible();
		await expect(page.getByText('Test Screen Large')).toBeVisible();
		// Sold-out product is filtered server-side
		await expect(page.getByText('Test Screen Sold Out')).toHaveCount(0);
		expect(errs).toEqual([]);
	});

	test('product detail page', async ({ page }) => {
		await page.goto('/shop/test-screen-small');
		await expect(page.getByRole('heading', { name: 'Test Screen Small' })).toBeVisible();
		// 'Add to order' is rendered on the detail page (and elsewhere)
		await expect(page.getByRole('button', { name: /add to order/i }).first()).toBeVisible();
	});

	test('contact page', async ({ page }) => {
		await page.goto('/contact');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	test('track page shell', async ({ page }) => {
		await page.goto('/track');
		// /track is prerender=true,ssr=false — shell renders, form hydrates
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	// /track surfaces the manual recovery path for customers who lost
	// their order reference (no email-only self-service lookup exists
	// yet — that's filed in roadmap.md under the resend-confirmation
	// follow-up). If this line silently disappears, customers whose
	// order email bounced have no discoverable path back to their
	// order; the only fallback is /contact, but only if they know to
	// go there. Pin the copy + the link target.
	test('track page exposes the lost-reference recovery path', async ({ page }) => {
		await page.goto('/track');
		await expect(page.getByText(/lost your order reference/i)).toBeVisible();
		const recoveryLink = page.getByRole('link', { name: /get in touch/i });
		await expect(recoveryLink).toBeVisible();
		await expect(recoveryLink).toHaveAttribute('href', '/contact');
	});

	// /payment/complete is the post-PayFast landing page. If a customer
	// closes the tab before this renders AND the order email never
	// arrives, they've lost their order reference for good — so this
	// page is the last chance to (a) show them the ref, (b) tell them
	// to save it, and (c) point them at a fallback if the email
	// doesn't show up. Pin all three.
	test('payment-complete shows ref + save hint + contact fallback', async ({ page }) => {
		await page.goto('/payment/complete?ref=MG-TEST-RECOVERY');
		await expect(page.getByText('MG-TEST-RECOVERY')).toBeVisible();
		// `getByText(/regex/i)` returns zero matches for substring text
		// inside a <p> whose start is interrupted by an inline element
		// (`<strong>{ref}</strong>. Save this for your records …`) — even
		// though it works fine for /track's lookup-help where the regex
		// matches the leading text-node. `locator(...).filter({hasText})`
		// uses a different matcher that handles the interrupted case
		// reliably.
		await expect(
			page.locator('p').filter({ hasText: 'Save this for your records' }),
		).toBeVisible();
		// Two links live on the page: "Track your order" (existing) and
		// "get in touch" (the new email-not-arriving fallback). Pin both
		// — the recovery flow breaks if either disappears.
		await expect(page.getByRole('link', { name: /track your order/i })).toBeVisible();
		const fallbackLink = page.getByRole('link', { name: /get in touch/i });
		await expect(fallbackLink).toBeVisible();
		await expect(fallbackLink).toHaveAttribute('href', '/contact');
	});

	test('privacy / returns / terms render', async ({ page }) => {
		for (const route of ['/privacy', '/returns', '/terms']) {
			await page.goto(route);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		}
	});

	// /returns hosts the ECT Act s43 business-identification disclosure;
	// silent removal would break SA online-retail compliance, so pin the
	// stable structural markers here as a regression net.
	test('returns page exposes the ECT s43 disclosure block', async ({ page }) => {
		await page.goto('/returns');
		await expect(page.getByText('Registered business name')).toBeVisible();
		await expect(page.getByText('Legal status')).toBeVisible();
		await expect(page.getByText('Physical address')).toBeVisible();
		await expect(page.getByText('Malmesbury')).toBeVisible();
		await expect(page.getByText('082 326 4555')).toBeVisible();
		await expect(page.getByText('merylgreendesigns.com')).toBeVisible();
		await expect(page.getByText('Industry membership')).toBeVisible();
		// `Dispute resolution` (without { exact }) matches three elements
		// on this page — the `Your statutory rights and dispute resolution`
		// h2, the dt, and the dd that says "applicable dispute-resolution
		// forum". Pin the dt unambiguously.
		await expect(page.getByText('Dispute resolution', { exact: true })).toBeVisible();
		await expect(page.getByText('Access to your order record')).toBeVisible();
	});

	// POPIA s22 obliges the responsible party to notify the Information
	// Regulator and affected data subjects of a security compromise. The
	// privacy page commits to doing so; if the paragraph gets edited away
	// the commitment becomes an unrebuttable expectation gap, so pin it.
	test('privacy page commits to POPIA s22 breach notification', async ({ page }) => {
		await page.goto('/privacy');
		await expect(page.getByText('section 22 of POPIA')).toBeVisible();
	});
});

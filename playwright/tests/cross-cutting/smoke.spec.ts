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
		await expect(page.getByRole('heading', { name: /gallery/i })).toBeVisible();
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

	test('privacy / returns / terms render', async ({ page }) => {
		for (const route of ['/privacy', '/returns', '/terms']) {
			await page.goto(route);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		}
	});
});

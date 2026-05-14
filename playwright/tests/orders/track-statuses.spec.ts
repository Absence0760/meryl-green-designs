import { test, expect } from '@playwright/test';
import { placeOrder } from '../../helpers/place-order.ts';
import { patchOrderStatus } from '../../helpers/seed-sanity.ts';

// /track renders a status badge + a five-step progress indicator
// (pending → received → shipped → delivered, with cancelled as a
// separate dead-end state). Drive each status state from a placed
// order and assert the page reflects it correctly.

const apiUrl = () => process.env.API_URL!;

async function fetchTrack(
	page: import('@playwright/test').Page,
	orderRef: string,
	email: string,
) {
	await page.goto(`/track?ref=${orderRef}&email=${email}`);
	// Wait for the lookup to resolve and the status card to render.
	await expect(page.locator('.status-badge')).toBeVisible({ timeout: 10_000 });
}

test.describe('/track status rendering', () => {
	for (const status of [
		'pending_payment',
		'payment_received',
		'shipped',
		'delivered',
		'cancelled',
	] as const) {
		test(`renders the ${status} state correctly`, async ({ page, request }) => {
			const email = `track-${status.replace('_', '-')}@e2e.local`;
			const order = await placeOrder(request, { email });
			if (status !== 'pending_payment') {
				await patchOrderStatus(order.orderRef, status);
			}

			await fetchTrack(page, order.orderRef, email);

			// The badge carries a status-specific class
			await expect(page.locator(`.status-badge--${status}`)).toBeVisible();

			// The ref appears somewhere on the page
			await expect(page.getByText(order.orderRef)).toBeVisible();

			// The progress steps show the linear flow except for cancelled,
			// which is a terminal divergent state and doesn't mark any
			// progress steps as "done".
			if (status !== 'cancelled') {
				const stepLabels: Record<string, string> = {
					pending_payment: 'Pending payment',
					payment_received: 'Payment received',
					shipped: 'Shipped',
					delivered: 'Delivered',
				};
				await expect(page.locator('.status-steps')).toContainText(stepLabels[status]);
			}
		});
	}

	test('shipped: tracking number + carrier + URL render on the page', async ({
		page,
		request,
	}) => {
		const order = await placeOrder(request, { email: 'track-shipped-info@e2e.local' });

		// Set tracking via admin PATCH then flip the Sanity status.
		await request.patch(`${apiUrl()}/admin/orders/${order.orderRef}/tracking`, {
			headers: {
				authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
				'content-type': 'application/json',
				origin: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 7777}`,
			},
			data: {
				trackingNumber: 'CG-TRACK-001',
				trackingUrl: 'https://www.courierguy.co.za/track/CG-TRACK-001',
				shippingCarrier: 'Courier Guy',
			},
		});
		await patchOrderStatus(order.orderRef, 'shipped');

		await fetchTrack(page, order.orderRef, 'track-shipped-info@e2e.local');

		await expect(page.getByText('Courier Guy')).toBeVisible();
		await expect(page.getByText('CG-TRACK-001')).toBeVisible();

		// Track-your-parcel link points at the carrier URL (defence-in-depth
		// safeHttpUrl helper already filtered any non-http(s) values upstream).
		const link = page.getByRole('link', { name: /track your parcel/i });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute(
			'href',
			'https://www.courierguy.co.za/track/CG-TRACK-001',
		);
	});

	test('shipped without tracking info: no tracking link renders', async ({
		page,
		request,
	}) => {
		const order = await placeOrder(request, { email: 'track-no-tracking@e2e.local' });
		await patchOrderStatus(order.orderRef, 'shipped');

		await fetchTrack(page, order.orderRef, 'track-no-tracking@e2e.local');

		await expect(page.locator('.status-badge--shipped')).toBeVisible();
		await expect(page.getByRole('link', { name: /track your parcel/i })).toHaveCount(0);
	});
});

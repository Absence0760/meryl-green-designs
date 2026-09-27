import type { Product } from './sanity';

export type CartItem = {
	productId: string;
	name: string;
	price: number;
	quantity: number;
};

export function addItem(items: CartItem[], product: Product): void {
	if (product.priceZar == null) return;
	const existing = items.find((i) => i.productId === product._id);
	if (existing) {
		existing.quantity++;
	} else {
		items.push({
			productId: product._id,
			name: product.name,
			price: product.priceZar,
			quantity: 1
		});
	}
}

export function removeItem(items: CartItem[], productId: string): void {
	const idx = items.findIndex((i) => i.productId === productId);
	if (idx !== -1) items.splice(idx, 1);
}

export function incrementItem(items: CartItem[], productId: string): void {
	const item = items.find((i) => i.productId === productId);
	if (item) item.quantity++;
}

export function decrementItem(items: CartItem[], productId: string): void {
	const item = items.find((i) => i.productId === productId);
	if (!item) return;
	item.quantity--;
	if (item.quantity <= 0) removeItem(items, productId);
}

export function cartCount(items: CartItem[]): number {
	return items.reduce((s, i) => s + i.quantity, 0);
}

export function cartTotal(items: CartItem[]): number {
	return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

/** Accessible name for the header cart button — the visual badge alone is silent. */
export function cartButtonLabel(count: number): string {
	if (count <= 0) return 'Open cart';
	return `Open cart, ${count} ${count === 1 ? 'item' : 'items'}`;
}

/**
 * Text for the polite live region in +layout.svelte, so "Add to order"
 * is announced to screen-reader users (WCAG 4.1.3 status messages).
 * Empty for an empty cart so nothing is read out on page load.
 */
export function cartStatusText(count: number): string {
	if (count <= 0) return '';
	return `${count} ${count === 1 ? 'item' : 'items'} in your order`;
}

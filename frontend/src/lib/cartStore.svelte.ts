import type { Product } from './sanity';
import {
	type CartItem,
	addItem,
	removeItem,
	incrementItem,
	decrementItem,
	cartCount,
	cartTotal
} from './cartLogic';

export type { CartItem };

function createCart() {
	let items = $state<CartItem[]>([]);
	// Bumped on every add (not on remove/decrement) so the header badge
	// can replay its "pop" via {#key cart.adds}.
	let adds = $state(0);

	return {
		get items() {
			return items;
		},
		get count() {
			return cartCount(items);
		},
		get total() {
			return cartTotal(items);
		},
		get adds() {
			return adds;
		},
		add(product: Product) {
			addItem(items, product);
			adds++;
		},
		remove(productId: string) {
			removeItem(items, productId);
		},
		increment(productId: string) {
			incrementItem(items, productId);
		},
		decrement(productId: string) {
			decrementItem(items, productId);
		},
		clear() {
			items.length = 0;
		}
	};
}

export const cart = createCart();

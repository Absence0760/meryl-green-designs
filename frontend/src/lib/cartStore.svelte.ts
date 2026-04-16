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
		add(product: Product) {
			addItem(items, product);
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

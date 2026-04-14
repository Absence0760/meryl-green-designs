import type { Product } from './sanity';

export type CartItem = {
	productId: string;
	name: string;
	price: number;
	quantity: number;
};

function createCart() {
	let items = $state<CartItem[]>([]);

	function add(product: Product) {
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

	function remove(productId: string) {
		const idx = items.findIndex((i) => i.productId === productId);
		if (idx !== -1) items.splice(idx, 1);
	}

	function increment(productId: string) {
		const item = items.find((i) => i.productId === productId);
		if (item) item.quantity++;
	}

	function decrement(productId: string) {
		const item = items.find((i) => i.productId === productId);
		if (!item) return;
		item.quantity--;
		if (item.quantity <= 0) remove(productId);
	}

	function clear() {
		items.length = 0;
	}

	return {
		get items() {
			return items;
		},
		get count() {
			return items.reduce((s, i) => s + i.quantity, 0);
		},
		get total() {
			return items.reduce((s, i) => s + i.price * i.quantity, 0);
		},
		add,
		remove,
		increment,
		decrement,
		clear
	};
}

export const cart = createCart();

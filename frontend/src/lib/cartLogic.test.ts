import { describe, it, expect } from 'vitest';
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

function makeProduct(overrides: Partial<Product> = {}): Product {
	return {
		_id: 'prod-1',
		name: 'Acacia Screen',
		slug: 'acacia-screen',
		blurb: null,
		description: null,
		priceZar: 1500,
		dimensions: null,
		available: true,
		order: 10,
		photos: [],
		...overrides
	};
}

describe('addItem', () => {
	it('adds a new product as a single line item', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct());
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			productId: 'prod-1',
			name: 'Acacia Screen',
			price: 1500,
			quantity: 1
		});
	});

	it('increments the existing quantity when the same product is added twice', () => {
		const items: CartItem[] = [];
		const p = makeProduct();
		addItem(items, p);
		addItem(items, p);
		expect(items).toHaveLength(1);
		expect(items[0]?.quantity).toBe(2);
	});

	it('keeps separate line items for different products', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct({ _id: 'prod-1', name: 'A' }));
		addItem(items, makeProduct({ _id: 'prod-2', name: 'B', priceZar: 2200 }));
		expect(items).toHaveLength(2);
		expect(items.map((i) => i.productId)).toEqual(['prod-1', 'prod-2']);
	});

	it('refuses to add a product whose price is null', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct({ priceZar: null }));
		expect(items).toHaveLength(0);
	});
});

describe('incrementItem / decrementItem', () => {
	it('increments the quantity of an existing item', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct());
		incrementItem(items, 'prod-1');
		expect(items[0]?.quantity).toBe(2);
	});

	it('decrements the quantity of an existing item', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct());
		incrementItem(items, 'prod-1');
		decrementItem(items, 'prod-1');
		expect(items[0]?.quantity).toBe(1);
	});

	it('removes the line item when decrement takes quantity to zero', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct());
		decrementItem(items, 'prod-1');
		expect(items).toHaveLength(0);
	});

	it('ignores increment/decrement for an unknown productId', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct());
		incrementItem(items, 'does-not-exist');
		decrementItem(items, 'does-not-exist');
		expect(items).toHaveLength(1);
		expect(items[0]?.quantity).toBe(1);
	});
});

describe('removeItem', () => {
	it('removes the matching line item and leaves others alone', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct({ _id: 'prod-1' }));
		addItem(items, makeProduct({ _id: 'prod-2', priceZar: 800 }));
		removeItem(items, 'prod-1');
		expect(items).toHaveLength(1);
		expect(items[0]?.productId).toBe('prod-2');
	});

	it('is a no-op for an unknown productId', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct());
		removeItem(items, 'does-not-exist');
		expect(items).toHaveLength(1);
	});
});

describe('cartCount and cartTotal', () => {
	it('cartCount sums quantities across line items', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct({ _id: 'prod-1' }));
		addItem(items, makeProduct({ _id: 'prod-1' }));
		addItem(items, makeProduct({ _id: 'prod-2', priceZar: 2000 }));
		expect(cartCount(items)).toBe(3);
	});

	it('cartTotal multiplies price by quantity for each line item', () => {
		const items: CartItem[] = [];
		addItem(items, makeProduct({ _id: 'prod-1', priceZar: 1500 }));
		addItem(items, makeProduct({ _id: 'prod-1', priceZar: 1500 }));
		addItem(items, makeProduct({ _id: 'prod-2', priceZar: 2200 }));
		expect(cartTotal(items)).toBe(1500 * 2 + 2200);
	});

	it('count and total are zero for an empty cart', () => {
		expect(cartCount([])).toBe(0);
		expect(cartTotal([])).toBe(0);
	});
});

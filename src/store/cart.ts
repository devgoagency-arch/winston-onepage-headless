import { persistentMap } from '@nanostores/persistent';
import { atom } from 'nanostores';

export interface CartItem {
    id: number;
    name: string;
    price: number;
    color: string | null;
    size: string | null;
    quantity: number;
    image: string;
    slug: string;
}

export const cartItems = persistentMap<Record<string, string>>('wh_cart_v1', {});
export const isCartOpen = atom(false);

export function addToCart(product: any, quantity: number, color: string | null, size: string | null, image: string) {
    const cart = cartItems.get();
    const itemId = `${product.id}-${color || 'no-color'}-${size || 'no-size'}`;

    if (cart[itemId]) {
        const item = JSON.parse(cart[itemId]) as CartItem;
        item.quantity += quantity;
        cartItems.setKey(itemId, JSON.stringify(item));
    } else {
        const newItem: CartItem = {
            id: product.id,
            name: product.name,
            price: parseInt(product.prices.price) / (10 ** product.prices.currency_minor_unit),
            color,
            size,
            quantity,
            image,
            slug: product.slug
        };
        cartItems.setKey(itemId, JSON.stringify(newItem));
    }

    isCartOpen.set(true);
}

export function removeFromCart(itemId: string) {
    cartItems.setKey(itemId, undefined as any);
}

export function updateQuantity(itemId: string, quantity: number) {
    if (quantity < 1) {
        removeFromCart(itemId);
        return;
    }
    const cart = cartItems.get();
    if (cart[itemId]) {
        const item = JSON.parse(cart[itemId]) as CartItem;
        item.quantity = quantity;
        cartItems.setKey(itemId, JSON.stringify(item));
    }
}

export function clearCart() {
    const keys = Object.keys(cartItems.get());
    keys.forEach(key => cartItems.setKey(key, undefined as any));
}

export function getCartTotal() {
    const cart = cartItems.get();
    return Object.values(cart).reduce((total, itemStr) => {
        const item = JSON.parse(itemStr) as CartItem;
        return total + (item.price * item.quantity);
    }, 0);
}

export function getCartCount() {
    const cart = cartItems.get();
    return Object.values(cart).reduce((total, itemStr) => {
        const item = JSON.parse(itemStr) as CartItem;
        return total + item.quantity;
    }, 0);
}

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
    // Metadata for variable products
    attributes?: any[];
    variations?: any[];
}

export const cartItems = persistentMap<Record<string, string>>('wh_cart_v2', {});
export const isCartOpen = atom(false);

export function addToCart(product: any, quantity: number, color: string | null, size: string | null, image: string) {
    const cart = cartItems.get();

    // Si es un producto variable, intentamos encontrar el ID de la variación específica
    let finalId = product.id;
    if (product.variations && product.variations.length > 0 && color && size) {
        const found = product.variations.find((v: any) => {
            const vColor = v.attributes?.find((a: any) => a.name.toLowerCase().includes('color') || a.name === 'Pa_selecciona-el-color')?.value.toLowerCase();
            const vSize = v.attributes?.find((a: any) => a.name.toLowerCase().includes('talla') || a.name === 'Pa_selecciona-una-talla')?.value.toLowerCase();
            return vColor === color.toLowerCase() && vSize === size.toLowerCase();
        });
        if (found) finalId = found.id;
    }

    const itemId = `${product.id}-${color || 'no-color'}-${size || 'no-size'}`;

    if (cart[itemId]) {
        const item = JSON.parse(cart[itemId]) as CartItem;
        item.quantity += quantity;
        cartItems.setKey(itemId, JSON.stringify(item));
    } else {
        const newItem: CartItem = {
            id: finalId,
            name: product.name,
            price: (typeof product.prices.price === 'string' ? parseInt(product.prices.price) : product.prices.price) / (10 ** (product.prices.currency_minor_unit || 0)),
            color,
            size,
            quantity,
            image,
            slug: product.slug,
            attributes: product.attributes,
            variations: product.variations
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

export function updateCartItemVariation(oldKey: string, newColor: string | null, newSize: string | null) {
    const cart = cartItems.get();
    if (!cart[oldKey]) return;

    const item = JSON.parse(cart[oldKey]) as CartItem;
    const baseProductId = oldKey.split('-')[0];
    const newKey = `${baseProductId}-${newColor || 'no-color'}-${newSize || 'no-size'}`;

    // Si la nueva combinación ya existe, sumamos las cantidades
    if (cart[newKey] && newKey !== oldKey) {
        const existingItem = JSON.parse(cart[newKey]) as CartItem;
        existingItem.quantity += item.quantity;
        cartItems.setKey(newKey, JSON.stringify(existingItem));
        cartItems.setKey(oldKey, undefined as any);
    } else {
        // Si no existe, actualizamos los datos y cambiamos el ID si es necesario
        item.color = newColor;
        item.size = newSize;

        // Intentar encontrar el nuevo ID de variación si tenemos los datos
        if (item.variations && item.variations.length > 0 && newColor && newSize) {
            const found = item.variations.find((v: any) => {
                const vColor = v.attributes?.find((a: any) => a.name.toLowerCase().includes('color') || a.name === 'Pa_selecciona-el-color')?.value.toLowerCase();
                const vSize = v.attributes?.find((a: any) => a.name.toLowerCase().includes('talla') || a.name === 'Pa_selecciona-una-talla')?.value.toLowerCase();
                return vColor === newColor.toLowerCase() && vSize === newSize.toLowerCase();
            });
            if (found) item.id = found.id;
        }

        if (newKey !== oldKey) {
            cartItems.setKey(oldKey, undefined as any);
        }
        cartItems.setKey(newKey, JSON.stringify(item));
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

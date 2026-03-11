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
    try {
        const cart = cartItems.get();

        if (!product || !product.prices) {
            console.error('[Cart Store] Producto inválido:', product);
            return;
        }

        // Si es un producto variable, intentamos encontrar el ID de la variación específica
        let finalId = product.id;
        if (product.variations && product.variations.length > 0 && (color || size)) {
            const found = product.variations.find((v: any) => {
                const vColor = v.attributes?.find((a: any) => 
                    a.name.toLowerCase().includes('color') || a.name === 'Pa_selecciona-el-color'
                );
                const vSize = v.attributes?.find((a: any) => 
                    a.name.toLowerCase().includes('talla') || a.name === 'Pa_selecciona-una-talla'
                );

                const colorValue = (vColor?.value || vColor?.option || '').toLowerCase().trim();
                const sizeValue = (vSize?.value || vSize?.option || '').toLowerCase().trim();

                const matchesColor = !color || colorValue === color.toLowerCase().trim();
                const matchesSize = !size || sizeValue === size.toLowerCase().trim();

                return matchesColor && matchesSize;
            });
            if (found) finalId = found.id;
        }

        const itemId = `${product.id}-${(color || 'no-color').toLowerCase()}-${(size || 'no-size').toLowerCase()}`;

        const rawPrice = product.prices.price || '0';
        const currencyMinorUnit = product.prices.currency_minor_unit || 0;
        const processedPrice = (typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice) / (10 ** currencyMinorUnit);

        if (cart[itemId]) {
            try {
                const item = JSON.parse(cart[itemId]) as CartItem;
                item.quantity += quantity;
                cartItems.setKey(itemId, JSON.stringify(item));
            } catch (e) {
                // Si el JSON estaba corrupto, lo sobreescribimos
                const newItem = createCartItem(finalId, product, processedPrice, color, size, quantity, image);
                cartItems.setKey(itemId, JSON.stringify(newItem));
            }
        } else {
            const newItem = createCartItem(finalId, product, processedPrice, color, size, quantity, image);
            cartItems.setKey(itemId, JSON.stringify(newItem));
        }

        isCartOpen.set(true);
    } catch (error) {
        console.error('[Cart Store] Error fatal en addToCart:', error);
    }
}

// Función auxiliar para crear el objeto de item
function createCartItem(id: number, product: any, price: number, color: string | null, size: string | null, quantity: number, image: string): CartItem {
    return {
        id,
        name: product.name,
        price,
        color,
        size,
        quantity,
        image,
        slug: product.slug,
        attributes: product.attributes,
        variations: product.variations
    };
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

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

// Función auxiliar robusta para encontrar variaciones de WooCommerce
function findVariation(variations: any[], color: string | null, size: string | null): any | null {
    if (!variations || variations.length === 0) return null;
    
    return variations.find((v: any) => {
        // Buscamos atributos de color y talla de forma flexible
        const vColorAttr = v.attributes?.find((a: any) => 
            a.name.toLowerCase().includes('color') || 
            a.name.toLowerCase().includes('pa_selecciona-el-color') || 
            a.id === 'pa_color' ||
            a.name === 'Pa_selecciona-el-color'
        );
        const vSizeAttr = v.attributes?.find((a: any) => 
            a.name.toLowerCase().includes('talla') || 
            a.name.toLowerCase().includes('pa_selecciona-una-talla') || 
            a.id === 'pa_talla' ||
            a.name === 'Pa_selecciona-una-talla'
        );

        // Extraer valores ( WooCommerce puede usar 'option' o 'value' dependiendo de la versión de la API )
        const vColorValue = (vColorAttr?.option || vColorAttr?.value || '').toLowerCase().trim();
        const vSizeValue = (vSizeAttr?.option || vSizeAttr?.value || '').toLowerCase().trim();

        const targetColor = (color || '').toLowerCase().trim();
        const targetSize = (size || '').toLowerCase().trim();

        const matchesColor = !color || vColorValue === targetColor;
        const matchesSize = !size || vSizeValue === targetSize;

        return matchesColor && matchesSize;
    });
}

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
            const found = findVariation(product.variations, color, size);
            if (found) {
                finalId = found.id;
                console.log(`[Cart Store] Variación detectada: ${finalId} para ${color}/${size}`);
            } else {
                console.warn(`[Cart Store] No se encontró variación para ${color}/${size} en el producto ${product.id}`);
            }
        }

        const itemId = `${product.id}-${(color || 'no-color').toLowerCase()}-${(size || 'no-size').toLowerCase()}`;

        const rawPrice = product.prices.price || '0';
        const currencyMinorUnit = product.prices.currency_minor_unit || 0;
        const processedPrice = (typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice) / (10 ** currencyMinorUnit);

        if (cart[itemId]) {
            try {
                const item = JSON.parse(cart[itemId]) as CartItem;
                item.quantity += quantity;
                // Actualizamos el ID por si acaso
                item.id = finalId;
                cartItems.setKey(itemId, JSON.stringify(item));
            } catch (e) {
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
        try {
            const item = JSON.parse(cart[itemId]) as CartItem;
            item.quantity = quantity;
            cartItems.setKey(itemId, JSON.stringify(item));
        } catch(e) {}
    }
}

export function updateCartItemVariation(oldKey: string, newColor: string | null, newSize: string | null) {
    const cart = cartItems.get();
    if (!cart[oldKey]) return;

    try {
        const item = JSON.parse(cart[oldKey]) as CartItem;
        const baseProductId = oldKey.split('-')[0];
        const newKey = `${baseProductId}-${(newColor || 'no-color').toLowerCase()}-${(newSize || 'no-size').toLowerCase()}`;

        // Si la nueva combinación ya existe, sumamos las cantidades
        if (cart[newKey] && newKey !== oldKey) {
            const existingItem = JSON.parse(cart[newKey]) as CartItem;
            existingItem.quantity += item.quantity;
            cartItems.setKey(newKey, JSON.stringify(existingItem));
            cartItems.setKey(oldKey, undefined as any);
        } else {
            item.color = newColor;
            item.size = newSize;

            if (item.variations && item.variations.length > 0 && (newColor || newSize)) {
                const found = findVariation(item.variations, newColor, newSize);
                if (found) item.id = found.id;
            }

            if (newKey !== oldKey) {
                cartItems.setKey(oldKey, undefined as any);
            }
            cartItems.setKey(newKey, JSON.stringify(item));
        }
    } catch(e) {}
}

export function clearCart() {
    const keys = Object.keys(cartItems.get());
    keys.forEach(key => cartItems.setKey(key, undefined as any));
}

export function getCartTotal() {
    const cart = cartItems.get();
    return Object.values(cart).reduce((total, itemStr) => {
        try {
            const item = JSON.parse(itemStr) as CartItem;
            return total + (item.price * item.quantity);
        } catch(e) { return total; }
    }, 0);
}

export function getCartCount() {
    const cart = cartItems.get();
    return Object.values(cart).reduce((total, itemStr) => {
        try {
            const item = JSON.parse(itemStr) as CartItem;
            return total + item.quantity;
        } catch(e) { return total; }
    }, 0);
}

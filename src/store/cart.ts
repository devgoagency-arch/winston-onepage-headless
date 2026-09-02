import { persistentMap } from '@nanostores/persistent';
import { atom } from 'nanostores';
import { trackMetaEvent } from '../utils/metaPixel';
export interface CartItem {
    product_id?: number; // Main product id
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
    categories?: any[];
}

export const cartItems = persistentMap<Record<string, string>>('wh_cart_v2', {});
export const isCartOpen = atom(false);
export const isSearchOpen = atom(false);

// Función de normalización para comparar slugs/nombres de forma robusta
function normalizeAttr(str: any): string {
    if (!str) return '';
    const s = String(str);
    return s.toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9]/g, '');      // Quitar todo lo que no sea alfanumérico
}

// Función auxiliar robusta para encontrar variaciones de WooCommerce
function findVariation(variations: any[], color: string | null, size: string | null): any | null {
    if (!variations || variations.length === 0) return null;
    
    const targetColor = normalizeAttr(color || '');
    const targetSize = normalizeAttr(size || '');

    console.log(`[Cart Store] Buscando variación para: color="${targetColor}", talla="${targetSize}"`);

    // Prioridad 1: Coincidencia exacta de ambos (si están presentes)
    const found = variations.find((v: any) => {
        const vColorAttr = v.attributes?.find((a: any) => {
            const name = String(a.name || '').toLowerCase();
            const id = String(a.id || '').toLowerCase();
            return name.includes('color') || id.includes('color') || name.includes('selecciona-el-color');
        });

        const vSizeAttr = v.attributes?.find((a: any) => {
            const name = String(a.name || '').toLowerCase();
            const id = String(a.id || '').toLowerCase();
            return name.includes('talla') || id.includes('talla') || 
                   name.includes('size') || id.includes('size') ||
                   name.includes('tamano') || name.includes('tamaño') ||
                   name.includes('numero') || name.includes('nmero') ||
                   name.includes('selecciona-una-talla');
        });

        const vColorValue = normalizeAttr(vColorAttr?.value || vColorAttr?.option || '');
        const vSizeValue = normalizeAttr(vSizeAttr?.value || vSizeAttr?.option || '');

        // Si la variación no tiene el atributo, lo tratamos como "cualquier" (any)
        const matchesColor = !color || !vColorValue || vColorValue === targetColor;
        const matchesSize = !size || !vSizeValue || vSizeValue === targetSize;

        return matchesColor && matchesSize;
    });

    if (found) {
        console.log(`[Cart Store] ✅ Variación encontrada: ${found.id}`);
    } else {
        console.warn(`[Cart Store] ❌ No se encontró variación para los atributos seleccionados.`);
    }

    return found;
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

        const itemId = `${product.id}-${String(color || 'no-color').toLowerCase()}-${String(size || 'no-size').toLowerCase()}`;

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
                const newItem = createCartItem(finalId, product.id, product, processedPrice, color, size, quantity, image);
                cartItems.setKey(itemId, JSON.stringify(newItem));
            }
        } else {
            const newItem = createCartItem(finalId, product.id, product, processedPrice, color, size, quantity, image);
            cartItems.setKey(itemId, JSON.stringify(newItem));
        }

        isCartOpen.set(true);

        // Disparar evento de Meta Pixel
        if (typeof window !== 'undefined') {
            trackMetaEvent('AddToCart', {
                content_name: product.name,
                content_ids: [finalId.toString()],
                content_type: 'product',
                value: processedPrice * quantity,
                currency: product?.prices?.currency_code || 'COP'
            });
        }
    } catch (error) {
        console.error('[Cart Store] Error fatal en addToCart:', error);
    }
}

function createCartItem(id: number, product_id: number, product: any, price: number, color: string | null, size: string | null, quantity: number, image: string): CartItem {
    return {
        id,
        product_id,
        name: product.name,
        price,
        color,
        size,
        quantity,
        image,
        slug: product.slug,
        attributes: product.attributes,
        variations: product.variations,
        categories: product.categories || []
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
        const newKey = `${baseProductId}-${String(newColor || 'no-color').toLowerCase()}-${String(newSize || 'no-size').toLowerCase()}`;

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

export function calculateComboDiscount(items: (CartItem & { key?: string })[]) {
    const cat_jeans = [958];
    const cat_camisas = [956, 954];
    const cat_cinturon = [967, 963];

    let tiene_jean = false;
    let tiene_camisa = false;
    let tiene_cinturon = false;

    let subtotal_combo = 0;

    items.forEach(item => {
        let es_jean = false;
        let es_camisa = false;
        let es_cinturon = false;

        if (item.categories && item.categories.length > 0) {
            const catIds = item.categories.map((c: any) => c.id);
            es_jean = catIds.some((id: number) => cat_jeans.includes(id));
            es_camisa = catIds.some((id: number) => cat_camisas.includes(id));
            es_cinturon = catIds.some((id: number) => cat_cinturon.includes(id));
        } else {
            // Fallback automático para productos viejos en el carrito que no tienen las categorías guardadas
            const slug = String(item.slug || '').toLowerCase();
            const name = String(item.name || '').toLowerCase();
            es_jean = slug.includes('jean') || name.includes('jean');
            es_camisa = slug.includes('camisa') || slug.includes('polo') || name.includes('camisa') || name.includes('polo');
            es_cinturon = slug.includes('reata') || slug.includes('cinturon') || name.includes('reata') || name.includes('cinturon');
        }

        if (es_jean) {
            tiene_jean = true;
            subtotal_combo += (item.price * item.quantity);
        }
        if (es_camisa) {
            tiene_camisa = true;
            subtotal_combo += (item.price * item.quantity);
        }
        if (es_cinturon) {
            tiene_cinturon = true;
            subtotal_combo += (item.price * item.quantity);
        }
    });

    if (tiene_jean && tiene_camisa && tiene_cinturon) {
        return subtotal_combo * 0.25;
    }

    return 0;
}

/**
 * Calcula el descuento 2x1 para el Suéter Tejido Escalera.
 * Regla: Por cada 2 suéteres escalera en el carrito, el de menor precio es GRATIS.
 * - 1 suéter → precio full (sin descuento)
 * - 2 suéteres → el más barato es gratis
 * - 3 suéteres → 1 gratis + 1 full (paga 2)
 * - 4 suéteres → 2 gratis (paga 2)
 *
 * Implementación: expande los ítems según su quantity, ordena de mayor a menor precio,
 * y suma los precios en posiciones pares (0-indexed: 1, 3, 5...) como descuento.
 */
export function calculateSweater2x1Discount(items: (CartItem & { key?: string })[]): number {
    // Tag ID conocido: 937 ("2×1 en Suéteres tejidos Rombo y Escalera")
    const TAG_2X1_ID = 937;
    const TAG_2X1_SLUG = '2x1-en-sueteres-tejidos-rombo-y-escalera';
    const CAT_SUETERES = 955; // "Suéteres y Chalecos"

    // Recopilar todos los suéteres escalera expandidos por cantidad
    const precios: number[] = [];

    items.forEach(item => {
        let es_sueter_escalera = false;

        // Primero verificar por tags (más preciso)
        if (item.categories && Array.isArray(item.categories)) {
            // Verificar si tiene el tag 2x1
        }
        // Verificar en tags (guardados en el item como parte de categories? No, en este proyecto las tags se guardan separado)
        // Fallback por slug/nombre — el producto es "Sueter Tejido Escalera"
        const slug = String(item.slug || '').toLowerCase();
        const name = String(item.name || '').toLowerCase();

        // Detectar por slug o nombre del producto
        const slugStr = slug || '';
        const nameStr = name || '';
        const esEscalera = slugStr.includes('escalera') || nameStr.includes('escalera');

        // Verificar por categoría si está disponible
        if (item.categories && item.categories.length > 0) {
            const catIds = item.categories.map((c: any) => c.id);
            const esSueterCategoria = catIds.includes(CAT_SUETERES);

            if (esSueterCategoria && esEscalera) {
                es_sueter_escalera = true;
            } else if (esEscalera) {
                es_sueter_escalera = true;
            }
        } else {
            es_sueter_escalera = esEscalera;
        }

        if (es_sueter_escalera) {
            // Expandir por quantity
            for (let i = 0; i < item.quantity; i++) {
                precios.push(item.price);
            }
        }
    });

    if (precios.length < 2) return 0;

    // Ordenar de mayor a menor precio
    precios.sort((a, b) => b - a);

    // Por cada 2 suéteres, el de menor precio (posición impar 1-indexed = índice par 0-indexed NO... )
    // Posición 1 paga, posición 2 gratis, posición 3 paga, posición 4 gratis...
    // En 0-indexed: índice 0 paga, índice 1 gratis, índice 2 paga, índice 3 gratis
    let descuento = 0;
    for (let i = 1; i < precios.length; i += 2) {
        descuento += precios[i];
    }

    return descuento;
}

/**
 * Calcula el total de todos los descuentos activos en el carrito.
 * Incluye: combo jean+camisa+cinturón (25%) y 2x1 suéter escalera.
 */
export function calculateTotalDiscount(items: (CartItem & { key?: string })[]): {
    comboDiscount: number;
    sweater2x1Discount: number;
    total: number;
} {
    const comboDiscount = calculateComboDiscount(items);
    const sweater2x1Discount = calculateSweater2x1Discount(items);
    return {
        comboDiscount,
        sweater2x1Discount,
        total: comboDiscount + sweater2x1Discount,
    };
}

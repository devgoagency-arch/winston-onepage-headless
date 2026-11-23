import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { cartItems } from '../store/cart';
import { calculateArmaTuBlack, type BlackUnit } from './blackDays';

/**
 * Cuánto ahorra, en total, quien suma este producto a su carrito de Arma tu Black.
 * Se calcula con la misma función del carrito (calculateArmaTuBlack): la suma de descuentos con el producto
 * menos la de antes. No es un porcentaje fijo porque el 50 % siempre es para el de menor precio del carrito.
 * - inCart: cuántas unidades de Arma tu Black ya hay en el carrito (0 = el primero lleva 15 %).
 * - saving: ahorro total adicional al sumarlo.
 */
export function useArmaSaving(price: number, slug?: string, name?: string, tags?: { id: number }[]) {
    const $cart = useStore(cartItems);
    return useMemo(() => {
        const items = Object.values($cart).filter(Boolean).map(raw => {
            try { return JSON.parse(raw as string) as BlackUnit; } catch { return null; }
        }).filter((i): i is BlackUnit => i !== null);
        const before = calculateArmaTuBlack(items);
        const after = calculateArmaTuBlack([...items, { price, quantity: 1, slug, name, tags, on_sale: false, regular_price: price }]);
        return { inCart: before.eligibleCount, saving: after.discount - before.discount };
    }, [$cart, price, slug, name, tags]);
}

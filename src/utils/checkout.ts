import { cartItems } from '../store/cart';
import { PUBLIC_WP_URL } from '../lib/woocommerce';

/**
 * Redirecciona al usuario a una página de WordPress (WooCommerce) 
 * pasando todos los items actuales del carrito para sincronizar la sesión.
 * @param path - La ruta de destino (ej: '/checkout/' o '/cart/')
 */
export function redirectToCheckout(path: string = '/') {
    const $cartItems = cartItems.get();
    const items = Object.values($cartItems).map(value => JSON.parse(value));

    // Dominio de WordPress donde está el WooCommerce real
    const wpDomain = PUBLIC_WP_URL;

    if (items.length === 0) {
        window.location.href = `${wpDomain}${path}`;
        return;
    }

    // Generamos la cadena ID:QTY para el plugin bridge de WooCommerce
    const itemsQuery = items.map(item => `${item.id}:${item.quantity}`).join(',');

    // Redirección con el parámetro fill_cart que sincroniza el carrito en WP
    // Usamos URLSearchParams para asegurar que el path sea correcto
    const baseUrl = `${wpDomain}${path}`;
    const separator = baseUrl.includes('?') ? '&' : '?';
    const finalUrl = `${baseUrl}${separator}fill_cart=${itemsQuery}`;

    console.log("Sincronizando carrito y redirigiendo a:", finalUrl);
    window.location.href = finalUrl;
}

export const prerender = false;
import type { APIRoute } from 'astro';

const PUBLIC_WP_URL = import.meta.env.PUBLIC_WP_URL || 'https://tienda.winstonandharrystore.com';
const WC_CONSUMER_KEY = import.meta.env.WC_CONSUMER_KEY || '';
const WC_CONSUMER_SECRET = import.meta.env.WC_CONSUMER_SECRET || '';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { code, subtotal } = await request.json();

        if (!code) {
            return new Response(JSON.stringify({ error: 'Código de cupón requerido.' }), { status: 400 });
        }

        // Consultar el cupón directamente a la WooCommerce REST API
        const credentials = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        let res: Response;
        try {
            res = await fetch(
                `${PUBLIC_WP_URL}/wp-json/wc/v3/coupons?code=${encodeURIComponent(code)}&per_page=1`,
                { headers: { 'Authorization': `Basic ${credentials}` }, signal: controller.signal }
            );
        } catch (fetchErr: any) {
            clearTimeout(timeout);
            return new Response(JSON.stringify({ error: 'No se pudo conectar al servidor. Intenta de nuevo.' }), { status: 503 });
        }
        clearTimeout(timeout);

        if (!res.ok) {
            return new Response(JSON.stringify({ error: 'Error al verificar el cupón.' }), { status: 500 });
        }

        const coupons = await res.json();
        if (!Array.isArray(coupons) || coupons.length === 0) {
            return new Response(JSON.stringify({ error: 'Cupón inválido o no encontrado.' }), { status: 404 });
        }

        const coupon = coupons[0];

        // Validar fecha de expiración
        if (coupon.date_expires && new Date(coupon.date_expires) < new Date()) {
            return new Response(JSON.stringify({ error: 'Este cupón ya expiró.' }), { status: 400 });
        }

        // Validar uso máximo
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
            return new Response(JSON.stringify({ error: 'Este cupón ya alcanzó su límite de usos.' }), { status: 400 });
        }

        // Calcular el descuento según el tipo
        const discountType = coupon.discount_type; // 'percent', 'fixed_cart', 'fixed_product'
        const amount = parseFloat(coupon.amount || '0');
        let discount = 0;

        if (discountType === 'percent') {
            discount = Math.round((subtotal * amount) / 100);
        } else if (discountType === 'fixed_cart' || discountType === 'fixed_product') {
            discount = Math.round(amount);
        }

        // Validar monto mínimo
        if (coupon.minimum_amount && parseFloat(coupon.minimum_amount) > 0) {
            if (subtotal < parseFloat(coupon.minimum_amount)) {
                return new Response(
                    JSON.stringify({ error: `El monto mínimo para este cupón es $${parseFloat(coupon.minimum_amount).toLocaleString('es-CO')}.` }),
                    { status: 400 }
                );
            }
        }

        return new Response(
            JSON.stringify({ 
                discount, 
                code: coupon.code, 
                type: discountType,
                free_shipping: Boolean(coupon.free_shipping)
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('[apply-coupon] Error:', err.message);
        return new Response(JSON.stringify({ error: 'Error al verificar el cupón.' }), { status: 500 });
    }
};

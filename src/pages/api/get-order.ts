// src/pages/api/get-order.ts
export const prerender = false;
import type { APIRoute } from 'astro';

const WC_URL = import.meta.env.WC_URL || 'https://tienda.winstonandharrystore.com';
const WC_KEY = import.meta.env.WC_CONSUMER_KEY;
const WC_SECRET = import.meta.env.WC_CONSUMER_SECRET;

export const GET: APIRoute = async ({ url, request }) => {
    console.log('API get-order URL:', url.href, 'Request URL:', request.url);
    const orderId = url.searchParams.get('id') || new URL(request.url).searchParams.get('id');

    if (!orderId || isNaN(Number(orderId))) {
        return new Response(JSON.stringify({ error: 'Invalid order ID' }), { status: 400 });
    }

    try {
        const credentials = btoa(`${WC_KEY}:${WC_SECRET}`);
        const res = await fetch(`${WC_URL}/wp-json/wc/v3/orders/${orderId}`, {
            headers: { Authorization: `Basic ${credentials}` }
        });

        if (!res.ok) {
            return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
        }

        const wcOrder = await res.json();

        // Devolver campos necesarios para tracking y para el UI del resumen
        return new Response(JSON.stringify({
            id: wcOrder.id,
            status: wcOrder.status,
            number: wcOrder.number,
            total: wcOrder.total,
            shipping_total: wcOrder.shipping_total,
            total_tax: wcOrder.total_tax,
            email: wcOrder.billing?.email,
            items: wcOrder.line_items?.map((item: any) => ({
                id: item.product_id,
                name: item.name,
                price: parseFloat(item.price || item.total),
                quantity: item.quantity,
                image: item.image?.src || '',
                attributes: item.meta_data?.map((m: any) => ({
                    key: m.display_key || m.key,
                    value: m.display_value || m.value
                })) || []
            })) || []
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
};

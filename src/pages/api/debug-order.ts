import type { APIRoute } from 'astro';
import { wcFetch } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const order_id = url.searchParams.get('id');
    if (!order_id) {
        return new Response(JSON.stringify({ error: 'Pasa ?id=NUMERO_DE_ORDEN' }), { status: 400 });
    }

    try {
        const order = await wcFetch(`orders/${order_id}`);
        return new Response(JSON.stringify({
            id: order.id,
            status: order.status,
            payment_method: order.payment_method,
            billing: order.billing,
            meta_data: order.meta_data,
        }, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

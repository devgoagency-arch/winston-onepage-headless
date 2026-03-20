export const prerender = false;
import type { APIRoute } from 'astro';
import { wcFetch } from '../../lib/woocommerce';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();

        // Construir el payload de orden para WooCommerce v3
        const orderPayload = {
            payment_method: body.payment_method || 'mercadopago',
            payment_method_title: body.payment_method === 'addi' ? 'Addi' : 'Mercado Pago',
            set_paid: false,
            status: 'pending',
            billing: {
                first_name: body.first_name,
                last_name: body.last_name,
                address_1: body.address_1,
                address_2: body.address_2 || '',
                city: body.city,
                state: body.state || '',
                postcode: body.postcode || '',
                country: 'CO',
                email: body.email,
                phone: body.phone,
            },
            shipping: {
                first_name: body.first_name,
                last_name: body.last_name,
                address_1: body.address_1,
                address_2: body.address_2 || '',
                city: body.city,
                state: body.state || '',
                postcode: body.postcode || '',
                country: 'CO',
            },
            line_items: body.items.map((item: any) => ({
                product_id: item.product_id,
                variation_id: item.variation_id || 0,
                quantity: item.quantity,
            })),
            meta_data: [
                { key: '_billing_cpf', value: body.document_id || '' },
            ],
            customer_note: body.order_notes || '',
        };

        // Crear la orden en WooCommerce
        const order = await wcFetch('/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload),
        });

        if (!order || !order.id) {
            return new Response(
                JSON.stringify({ error: 'No se pudo crear la orden' }),
                { status: 500 }
            );
        }

        // Obtener el link de pago según el método
        // WooCommerce genera la URL de pago en order.payment_url
        const paymentUrl = order.payment_url || 
            `${import.meta.env.WC_URL}/checkout/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;

        return new Response(
            JSON.stringify({
                order_id: order.id,
                order_key: order.order_key,
                order_number: order.number,
                payment_url: paymentUrl,
                status: order.status,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    } catch (error: any) {
        console.error('[API create-order] Error:', error.message);
        return new Response(
            JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
            { status: 500 }
        );
    }
};

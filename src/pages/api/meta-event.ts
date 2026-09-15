/**
 * /api/meta-event.ts
 * Endpoint SSR: recibe eventos del browser, agrega IP + User-Agent del servidor
 * y los reenvía a la Meta Conversions API para tracking server-side.
 * El browser llama a este endpoint en paralelo con fbq() para deduplicación.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { sendMetaServerEvent } from '../../lib/metaEvents';
import { wcFetch } from '../../lib/woocommerce';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { eventName, eventId, eventSourceUrl, customData, userData } = body;

        if (!eventName || !eventId) {
            return new Response(JSON.stringify({ error: 'eventName y eventId son requeridos' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- CAPI SERVER-SIDE LOCK PARA COMPRAS ---
        if (eventName === 'Purchase') {
            try {
                const orderData = await wcFetch(`/orders/${eventId}`);
                if (!orderData || !orderData.id) {
                    console.error(`[MetaCAP] Orden ${eventId} no encontrada para validación CAPI.`);
                    return new Response(JSON.stringify({ error: 'Order not found for CAPI lock' }), { status: 400 });
                }

                const validStatuses = ['processing', 'completed'];
                if (!validStatuses.includes(orderData.status) && parseFloat(orderData.total || '0') > 0) {
                    console.error(`[MetaCAP] Orden ${eventId} tiene estado inválido (${orderData.status}) para Purchase.`);
                    return new Response(JSON.stringify({ error: 'Order status invalid for Purchase' }), { status: 400 });
                }

                const isSent = orderData.meta_data?.some((m: any) => m.key === '_meta_capi_sent' && m.value === 'true');
                if (isSent) {
                    console.log(`[MetaCAP] Evento Purchase para orden ${eventId} ya fue enviado previamente. Ignorando.`);
                    return new Response(JSON.stringify({ ok: true, message: 'Already tracked' }), { 
                        status: 200,
                        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                    });
                }

                // Escribir el lock en WooCommerce — SI FALLA, ABORTAMOS para no disparar el evento sin lock
                const lockResult = await wcFetch(`/orders/${eventId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        meta_data: [{ key: '_meta_capi_sent', value: 'true' }]
                    })
                });

                if (!lockResult || lockResult.code) {
                    // wcFetch devuelve el JSON de error de WooCommerce si hay fallo de auth/permisos
                    const errorMsg = lockResult?.message || 'Lock write failed (unknown error)';
                    console.error(`[MetaCAP] ⛔ LOCK FALLIDO para orden ${eventId}: ${errorMsg}`);
                    console.error(`[MetaCAP] ⛔ Abortando envío a Meta para evitar duplicados sin lock. Revisa permisos de la API key de WooCommerce (necesita Lectura+Escritura).`);
                    return new Response(JSON.stringify({ error: 'WooCommerce lock failed — event NOT sent to Meta', details: errorMsg }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                console.log(`[MetaCAP] ✅ Lock guardado correctamente en WooCommerce para orden ${eventId}.`);
            } catch (err: any) {
                console.error(`[MetaCAP] ⛔ Excepción al escribir lock para orden ${eventId}:`, err.message);
                return new Response(JSON.stringify({ error: 'WooCommerce lock exception — event NOT sent to Meta', details: err.message }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        // ------------------------------------------


        // Extraer IP real del visitante (Vercel pone la IP en x-forwarded-for)
        const clientIp =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            '';

        const clientUserAgent = request.headers.get('user-agent') || '';

        await sendMetaServerEvent({
            eventName,
            eventId,
            eventSourceUrl: eventSourceUrl || '',
            clientIp,
            clientUserAgent,
            userData: userData || {},
            customData: customData || {},
        });

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (e: any) {
        console.error('[/api/meta-event] Error:', e?.message);
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }
};

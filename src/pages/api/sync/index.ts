import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({ status: "CONECTADO", message: "Listo para recibir Webhooks de Winston" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const topic = request.headers.get('x-wc-webhook-topic');
        const userAgent = request.headers.get('user-agent');
        const url = new URL(request.url);
        const origin = url.origin;
        
        console.log(`[Sync Webhook] RECIBIDO: ${request.method} ${url.pathname}`);
        console.log(`[Sync Webhook] Headers - Topic: ${topic}, UA: ${userAgent}`);

        let body;
        try {
            const rawBody = await request.text();
            console.log(`[Sync Webhook] Raw Body Length: ${rawBody.length}`);
            body = JSON.parse(rawBody);
        } catch (err: any) {
            console.log(`[Sync Webhook] Error parseando JSON: ${err.message}`);
            body = {}; 
        }

        console.log(`[Sync Webhook] Body keys: ${Object.keys(body).join(', ')}`);

        // Handshake inicial de WooCommerce (obligatorio para vincular)
        if (topic === 'webhook.test' || topic === 'action.ping' || (!body.slug && !body.id)) {
            console.log(`[Sync Webhook] Respondiendo Handshake OK para: ${topic}`);
            return new Response(JSON.stringify({ 
                success: true, 
                message: "Handshake OK",
                received_topic: topic 
            }), { 
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const slug = body.slug;
        const id = body.id;
        console.log(`[Sync Webhook] Procesando actualización: Slug=${slug}, ID=${id}`);

        const routesToRefresh = [`${origin}/`];
        if (slug) routesToRefresh.push(`${origin}/productos/${slug}`);

        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) routesToRefresh.push(`${origin}/categoria/${cat.slug}`);
            });
        }

        console.log(`[Sync Webhook] Intentando refrescar rutas: ${routesToRefresh.join(', ')}`);

        // Forzamos regeneración en segundo plano
        Promise.allSettled(
            routesToRefresh.map(u => fetch(u, { 
                method: 'GET', 
                headers: { 'Cache-Control': 'no-cache' } 
            }))
        ).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            console.log(`[Sync Webhook] Refresco completado: ${successCount}/${routesToRefresh.length} exitosos`);
        }).catch(e => console.error('[Sync Webhook] Error en fetch de refresco:', e));

        return new Response(JSON.stringify({ 
            success: true, 
            refreshed: routesToRefresh.length 
        }), { 
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error('[Sync Webhook Error Critico]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 200, // Seguimos devolviendo 200 para evitar que WooCommerce desactive el hook
            headers: { "Content-Type": "application/json" }
        });
    }
};

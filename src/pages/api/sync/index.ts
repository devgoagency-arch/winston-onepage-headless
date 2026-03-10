import type { APIRoute } from 'astro';
import crypto from 'node:crypto';

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({ status: "CONECTADO", message: "Listo para recibir Webhooks de Winston" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const topic = request.headers.get('x-wc-webhook-topic');
        const signature = request.headers.get('x-wc-webhook-signature');
        const userAgent = request.headers.get('user-agent');
        const secret = import.meta.env.WC_WEBHOOK_SECRET;
        
        const rawBody = await request.text();
        
        // 1. Verificación de Seguridad (HMAC)
        if (secret && signature) {
            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(rawBody).digest('base64');
            
            if (digest !== signature) {
                console.error('[Sync Webhook] Firma inválida detectada.');
                return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
            }
        }

        let body;
        try {
            body = JSON.parse(rawBody);
        } catch (err: any) {
            console.log(`[Sync Webhook] Error parseando JSON: ${err.message}`);
            body = {}; 
        }

        console.log(`[Sync Webhook] RECIBIDO Topic: ${topic} | Body: ${Object.keys(body).join(', ')}`);

        // Handshake inicial de WooCommerce
        if (topic === 'webhook.test' || topic === 'action.ping') {
            return new Response(JSON.stringify({ success: true, message: "Handshake OK" }), { 
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const slug = body.slug;
        const id = body.id;
        
        if (!slug && !id) {
            return new Response(JSON.stringify({ success: false, message: "No post identifier found" }), { 
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const origin = new URL(request.url).origin;
        const pathsToRevalidate = ['/'];
        if (slug) pathsToRevalidate.push(`/productos/${slug}`);

        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) pathsToRevalidate.push(`/categoria/${cat.slug}`);
            });
        }

        console.log(`[Sync Webhook] Revalidando rutas: ${pathsToRevalidate.join(', ')}`);

        // 2. Revalidación On-Demand (Vercel)
        // Intentamos usar el bypass token de revalidación si está configurado
        const revalidateToken = import.meta.env.VERCEL_REVALIDATE_TOKEN;
        
        if (revalidateToken) {
            Promise.allSettled(
                pathsToRevalidate.map(path => {
                    const purgeUrl = `${origin}${path}${path.includes('?') ? '&' : '?'}revalidate=${revalidateToken}`;
                    return fetch(purgeUrl, { method: 'GET' });
                })
            ).then(() => console.log('[Sync Webhook] Revalidación vía token enviada.'));
        } else {
            // Fallback: Si no hay token, al menos intentamos el fetch simple (menos efectivo en Edge)
            Promise.allSettled(
                pathsToRevalidate.map(path => fetch(`${origin}${path}`, { 
                    method: 'GET',
                    headers: { 'x-prerender-revalidate': '1' } 
                }))
            );
        }

        return new Response(JSON.stringify({ 
            success: true, 
            topic,
            revalidated: pathsToRevalidate.length 
        }), { 
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error('[Sync Webhook Error Critico]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 200 });
    }
};

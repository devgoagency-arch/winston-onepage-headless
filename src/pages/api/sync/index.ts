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
        const secret = import.meta.env.WC_WEBHOOK_SECRET;

        const rawBody = await request.text();

        // ─── DEBUG (quitar en producción) ────────────────────────────────────
        console.log('[Sync Webhook] Topic:', topic);
        console.log('[Sync Webhook] Signature recibida:', signature);
        console.log('[Sync Webhook] Secret definido:', !!secret);
        // ─────────────────────────────────────────────────────────────────────

        // 1. Verificación de Seguridad (HMAC)
        if (!secret) {
            // Sin secret configurado: solo permitir handshakes de prueba, bloquear el resto
            console.warn('[Sync Webhook] WC_WEBHOOK_SECRET no está definido en las variables de entorno.');
            if (topic !== 'webhook.test' && topic !== 'action.ping') {
                return new Response(JSON.stringify({ error: "Server misconfiguration: missing secret" }), { status: 500 });
            }
        } else if (signature) {
            // Validar firma HMAC-SHA256 en Base64
            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(rawBody).digest('base64');

            console.log('[Sync Webhook] Digest calculado:', digest);

            if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
                console.error('[Sync Webhook] ❌ Firma inválida.');
                return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
            }
            console.log('[Sync Webhook] ✅ Firma válida.');
        } else {
            // Hay secret pero no llegó firma — bloquear (excepto handshake manual de prueba)
            if (topic !== 'webhook.test' && topic !== 'action.ping') {
                console.error('[Sync Webhook] Petición sin firma rechazada.');
                return new Response(JSON.stringify({ error: "Missing signature" }), { status: 401 });
            }
        }

        // 2. Handshake inicial de WooCommerce (va DESPUÉS de validar firma)
        if (topic === 'webhook.test' || topic === 'action.ping') {
            return new Response(JSON.stringify({ success: true, message: "Handshake OK" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 3. Parsear body
        let body: any = {};
        try {
            body = JSON.parse(rawBody);
        } catch (err: any) {
            console.log(`[Sync Webhook] Error parseando JSON: ${err.message}`);
        }

        console.log(`[Sync Webhook] RECIBIDO Topic: ${topic} | Keys: ${Object.keys(body).join(', ')}`);

        const slug = body.slug;
        const id = body.id;

        if (!slug && !id) {
            return new Response(JSON.stringify({ success: false, message: "No post identifier found" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 4. Construir rutas a revalidar
        const origin = new URL(request.url).origin;
        const pathsToRevalidate = ['/'];
        if (slug) pathsToRevalidate.push(`/productos/${slug}`);

        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) pathsToRevalidate.push(`/categoria/${cat.slug}`);
            });
        }

        console.log(`[Sync Webhook] Revalidando rutas: ${pathsToRevalidate.join(', ')}`);

        // 5. Revalidación On-Demand (Vercel)
        const revalidateToken = import.meta.env.VERCEL_REVALIDATE_TOKEN;

        if (revalidateToken) {
            Promise.allSettled(
                pathsToRevalidate.map(path => {
                    const purgeUrl = `${origin}${path}${path.includes('?') ? '&' : '?'}revalidate=${revalidateToken}`;
                    return fetch(purgeUrl, { method: 'GET' });
                })
            ).then(() => console.log('[Sync Webhook] ✅ Revalidación vía token enviada.'));
        } else {
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
        console.error('[Sync Webhook Error Crítico]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
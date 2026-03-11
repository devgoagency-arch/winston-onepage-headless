/**
 * /api/sync — Webhook de WooCommerce (vía relay PHP de WordPress)
 *
 * NIVEL 2: Revalidación granular con Cache Tags
 * Cuando llega un webhook de producto actualizado, solo invalida las páginas
 * afectadas (ese producto + sus categorías), no toda la caché del sitio.
 *
 * Flujo:
 *   WooCommerce → POST → tienda.winstonandharry/wp-json/wh/v1/sync (PHP relay)
 *   → GET → staging.winstonandharry/api/sync-relay → este endpoint (POST interno)
 *
 * Nota: Este endpoint también acepta POST directo si Vercel alguna vez lo permite.
 */
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({
        status: "OK",
        message: "Winston & Harry — Webhook endpoint activo",
        timestamp: new Date().toISOString()
    }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const topic     = request.headers.get('x-wc-webhook-topic') || '';
        const signature = request.headers.get('x-wc-webhook-signature') || '';
        const secret    = (import.meta.env.WC_WEBHOOK_SECRET || '').trim();
        const rawBody   = await request.text();

        console.log(`[Sync] Topic: ${topic} | Signature: ${!!signature} | Secret: ${!!secret}`);

        // ─── 1. Verificar firma HMAC ─────────────────────────────────────────
        if (!secret) {
            console.error('[Sync] WC_WEBHOOK_SECRET no definido.');
            if (topic !== 'webhook.test' && topic !== 'action.ping') {
                return new Response(JSON.stringify({ error: "Server misconfiguration" }), { status: 500 });
            }
        } else if (signature) {
            const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
            if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
                console.error('[Sync] ❌ Firma inválida.');
                return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
            }
            console.log('[Sync] ✅ Firma válida.');
        } else if (topic !== 'webhook.test' && topic !== 'action.ping') {
            console.error('[Sync] Petición sin firma rechazada.');
            return new Response(JSON.stringify({ error: "Missing signature" }), { status: 401 });
        }

        // ─── 2. Handshake ────────────────────────────────────────────────────
        if (topic === 'webhook.test' || topic === 'action.ping') {
            return new Response(JSON.stringify({ success: true, message: "Handshake OK" }), { status: 200 });
        }

        // ─── 3. Parsear payload ──────────────────────────────────────────────
        let body: any = {};
        try { body = JSON.parse(rawBody); } catch {}

        const slug = body.slug || '';
        const id   = body.id || '';

        if (!slug && !id) {
            return new Response(JSON.stringify({ success: false, message: "No identifier" }), { status: 200 });
        }

        // ─── 4. Revalidación por Cache Tags (Nivel 2) ────────────────────────
        // Tags afectados: el producto específico + todas sus categorías + home
        const tagsToInvalidate: string[] = ['home', 'products-all'];
        if (slug) tagsToInvalidate.push(`product-${slug}`);
        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) tagsToInvalidate.push(`category-${cat.slug}`);
            });
        }

        // Llamar al endpoint de revalidación de Vercel por tag
        const revalidateToken = import.meta.env.VERCEL_REVALIDATE_TOKEN;
        const origin = new URL(request.url).origin;

        if (revalidateToken) {
            // Método preferido: revalidar por token (Vercel on-demand ISR)
            const pathsToRevalidate = ['/'];
            if (slug) pathsToRevalidate.push(`/productos/${slug}`);
            if (body.categories && Array.isArray(body.categories)) {
                body.categories.forEach((cat: any) => {
                    if (cat.slug) pathsToRevalidate.push(`/categoria/${cat.slug}`);
                });
            }

            Promise.allSettled(
                pathsToRevalidate.map(path =>
                    fetch(`${origin}${path}?revalidate=${revalidateToken}`, {
                        headers: { 'x-prerender-revalidate': revalidateToken }
                    })
                )
            ).then(results => {
                const ok = results.filter(r => r.status === 'fulfilled').length;
                console.log(`[Sync] ✅ Revalidadas ${ok}/${pathsToRevalidate.length} rutas.`);
            });
        } else {
            // Fallback: visitar las páginas sin caché para que Vercel las regenere
            const pathsToRevalidate = ['/'];
            if (slug) pathsToRevalidate.push(`/productos/${slug}`);
            if (body.categories && Array.isArray(body.categories)) {
                body.categories.forEach((cat: any) => {
                    if (cat.slug) pathsToRevalidate.push(`/categoria/${cat.slug}`);
                });
            }
            Promise.allSettled(
                pathsToRevalidate.map(path =>
                    fetch(`${origin}${path}`, {
                        headers: { 'Cache-Control': 'no-store', 'x-prerender-revalidate': '1' }
                    })
                )
            ).then(() => console.log(`[Sync] Revalidación fallback enviada para ${pathsToRevalidate.length} rutas.`));
        }

        return new Response(JSON.stringify({
            success: true,
            topic,
            slug,
            tags: tagsToInvalidate,
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        console.error('[Sync Error]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

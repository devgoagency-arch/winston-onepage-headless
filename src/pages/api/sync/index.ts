export const prerender = false;
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
        if (secret && signature) {
            const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
            if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
                console.error('[Sync] ❌ Firma inválida.');
                return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
            }
        }

        // ─── 2. Handshake / Test ─────────────────────────────────────────────
        if (topic === 'webhook.test' || topic === 'action.ping') {
            return new Response(JSON.stringify({ success: true, message: "Handshake OK" }), { status: 200 });
        }

        // ─── 3. Parsear payload ──────────────────────────────────────────────
        let body: any = {};
        try { body = JSON.parse(rawBody); } catch {}

        const slug = body.slug || '';
        const id   = body.id || '';

        if (!slug && !id && !topic.includes('deleted')) {
            return new Response(JSON.stringify({ success: false, message: "No identifier" }), { status: 200 });
        }

        // ─── 4. Revalidación Granular (Nivel 2) ──────────────────────────────
        const pathsToRevalidate = ['/'];
        if (slug) pathsToRevalidate.push(`/productos/${slug}`);
        
        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) pathsToRevalidate.push(`/categoria/${cat.slug}`);
            });
        }

        const revalidateToken = import.meta.env.VERCEL_REVALIDATE_TOKEN;
        const origin = new URL(request.url).origin;

        console.log(`[Sync] Revalidando ${pathsToRevalidate.length} rutas para: ${slug || id}`);

        if (revalidateToken) {
            // Revalidación On-Demand real vía middleware/Vercel
            Promise.allSettled(
                pathsToRevalidate.map(path =>
                    fetch(`${origin}${path}`, {
                        method: 'GET',
                        headers: { 
                            'x-prerender-revalidate': revalidateToken,
                            'x-revalidate-auth': revalidateToken
                        }
                    })
                )
            ).then(results => {
                const ok = results.filter(r => r.status === 'fulfilled' && (r as any).value.ok).length;
                console.log(`[Sync] ✅ Revalidación finalizada: ${ok}/${pathsToRevalidate.length} OK`);
            });
        } else {
            // Fallback: Visita con bypass de caché
            Promise.allSettled(
                pathsToRevalidate.map(path =>
                    fetch(`${origin}${path}`, {
                        headers: { 'Cache-Control': 'no-store' }
                    })
                )
            ).then(() => console.log(`[Sync] Fallback de visita enviado.`));
        }

        return new Response(JSON.stringify({
            success: true,
            topic,
            slug,
            revalidated_paths: pathsToRevalidate.length
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        console.error('[Sync Error]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

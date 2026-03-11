/**
 * /api/sync-relay — Recibe notificaciones del relay PHP de WordPress
 * 
 * WordPress no puede hacer POST directo a Vercel (bloqueado).
 * Este endpoint recibe GETs desde el relay PHP con un token secreto.
 * 
 * Vercel acepta GETs sin problema — solo los POSTs externos son bloqueados.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, url }) => {
    const token = url.searchParams.get('token');
    const path  = url.searchParams.get('path') || '/';
    const topic = url.searchParams.get('topic') || '';

    // 1. Verificar token secreto
    const expectedToken = import.meta.env.VERCEL_RELAY_TOKEN;

    if (!expectedToken) {
        console.error('[Sync Relay] VERCEL_RELAY_TOKEN no configurado en Vercel.');
        return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500 });
    }

    if (token !== expectedToken) {
        console.error('[Sync Relay] Token inválido recibido:', token?.substring(0, 8));
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    console.log(`[Sync Relay] Revalidando: ${path} (topic: ${topic})`);

    // 2. Forzar regeneración de la ruta visitándola sin caché
    try {
        const origin = new URL(request.url).origin;
        const revalidateUrl = `${origin}${path}`;

        // Fire and forget — no bloqueamos la respuesta
        fetch(revalidateUrl, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'x-vercel-revalidate': '1',
            }
        }).catch(e => console.error('[Sync Relay] Error revalidando:', e.message));

    } catch (e: any) {
        console.error('[Sync Relay] Error:', e.message);
    }

    return new Response(JSON.stringify({
        success: true,
        path,
        topic,
        timestamp: new Date().toISOString(),
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};

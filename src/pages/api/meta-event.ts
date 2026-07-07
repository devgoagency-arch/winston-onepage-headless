/**
 * /api/meta-event.ts
 * Endpoint SSR: recibe eventos del browser, agrega IP + User-Agent del servidor
 * y los reenvía a la Meta Conversions API para tracking server-side.
 * El browser llama a este endpoint en paralelo con fbq() para deduplicación.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { sendMetaServerEvent } from '../../lib/metaEvents';

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

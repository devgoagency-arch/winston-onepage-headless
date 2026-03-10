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
        const url = new URL(request.url);
        const origin = url.origin;
        
        let body;
        try {
            body = await request.json();
        } catch {
            body = {}; // Fallback si no es JSON (como los pings de prueba)
        }

        console.log(`[Sync] Hook: ${topic} | Body keys: ${Object.keys(body)}`);

        // Handshake inicial (obligatorio para vincular)
        if (topic === 'webhook.test' || topic === 'action.ping' || !body.slug) {
            return new Response(JSON.stringify({ success: true, message: "Handshake OK" }), { status: 200 });
        }

        const slug = body.slug;
        const routesToRefresh = [`${origin}/productos/${slug}`, `${origin}/`];

        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) routesToRefresh.push(`${origin}/categoria/${cat.slug}`);
            });
        }

        // Forzamos regeneración en segundo plano
        Promise.allSettled(
            routesToRefresh.map(u => fetch(u, { 
                method: 'GET', 
                headers: { 'Cache-Control': 'no-cache' } 
            }))
        ).catch(console.error);

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (e: any) {
        console.error('[Sync Error]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 200 });
    }
};

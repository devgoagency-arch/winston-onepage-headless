import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({ status: "RESILIENT", mode: "Ready for WooCommerce" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const slug = body.slug;
        const topic = request.headers.get('x-wc-webhook-topic');
        const url = new URL(request.url);
        const origin = url.origin;

        console.log(`[Sync] Hook received. Topic: ${topic}. Slug: ${slug}`);

        // Aceptar handshake inicial
        if (topic === 'webhook.test' || topic === 'action.ping') {
            return new Response(JSON.stringify({ message: "Handshake success" }), { status: 200 });
        }

        if (slug) {
            // Revalida el producto y el home
            const routesToRefresh = [`${origin}/productos/${slug}`, `${origin}/`];
            
            // Si hay categorías vinculadas
            if (body.categories && Array.isArray(body.categories)) {
                body.categories.forEach((cat: any) => {
                    if (cat.slug) routesToRefresh.push(`${origin}/categoria/${cat.slug}`);
                });
            }

            console.log(`[Sync] Triggering revalidation for ${routesToRefresh.length} routes...`);

            // Ejecución en segundo plano para no demorar a WooCommerce
            Promise.allSettled(
                routesToRefresh.map(targetUrl => fetch(targetUrl, {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Winston-Sync-Force' }
                }))
            ).catch(err => console.error('[Sync] Refresh error:', err));
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (e: any) {
        console.error('[Sync Error]', e.message);
        // Retornar 200 siempre para que WC dé por válido el endpoint
        return new Response(JSON.stringify({ error: e.message }), { status: 200 });
    }
};

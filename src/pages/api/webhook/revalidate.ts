import type { APIRoute } from 'astro';
import crypto from 'node:crypto';

/**
 * Endpoint para Revalidación Bajo Demanda (On-Demand Revalidation)
 */
export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({ message: "Revalidate endpoint is live. Use POST with WooCommerce webhooks." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const bodyText = await request.text();
        const signature = request.headers.get('x-wc-webhook-signature');
        const secret = import.meta.env.WC_WEBHOOK_SECRET || 'winston_revalidate_2024';

        // Verificación de firma HMAC-SHA256
        if (signature) {
            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(bodyText).digest('base64');
            
            if (digest !== signature) {
                console.error('[Webhook Revalidate] Firma inválida');
                return new Response(JSON.stringify({ message: 'Invalid signature' }), { status: 401 });
            }
        }

        const body = JSON.parse(bodyText);
        const url = new URL(request.url);
        const origin = url.origin;

        // Extraemos el slug del producto desde el body de WooCommerce
        const slug = body.slug;
        const id = body.id;

        if (!slug) {
            return new Response(JSON.stringify({ message: 'No slug found in hook body' }), { status: 400 });
        }

        console.log(`[Webhook Revalidate] Recibida actualización para: ${slug} (ID: ${id})`);

        // 1. Definimos las rutas que deben ser invalidadas/regeneradas
        const routesToRefresh = [
            `${origin}/productos/${slug}`, 
            `${origin}/`, // El home suele mostrar productos destacados
            `${origin}/api/products` // Cache de la API interna si existe
        ];

        // 2. Si el producto tiene categorías, también intentamos refrescar esas páginas
        if (body.categories && Array.isArray(body.categories)) {
            body.categories.forEach((cat: any) => {
                if (cat.slug) routesToRefresh.push(`${origin}/categoria/${cat.slug}`);
            });
        }

        // 3. Ejecutamos la regeneración (visita forzada)
        // En Vercel con Astro ISR, una visita GET forzará a la CDN a regenerar si el tiempo ha pasado 
        // o si usamos un bypass token si estuviera configurado.
        console.log(`[Webhook Revalidate] Forzando regeneración de ${routesToRefresh.length} rutas...`);
        
        const refreshResults = await Promise.allSettled(
            routesToRefresh.map(targetUrl => fetch(targetUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Winston-Harry-Revalidator-Hook',
                    'Cache-Control': 'no-cache' // Intentamos saltar la caché para que la CDN pida una nueva versión al servidor
                }
            }))
        );

        const successCount = refreshResults.filter(r => r.status === 'fulfilled').length;

        return new Response(JSON.stringify({
            success: true,
            slug,
            refreshed_routes: routesToRefresh,
            completed: successCount,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('[Webhook Revalidate Error]:', error.message);
        return new Response(JSON.stringify({ success: false, error: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

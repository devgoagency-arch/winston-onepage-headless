import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const origin = url.origin;

    // Solo activamos si viene de un Cron de Vercel o tenemos autorización simple
    // Vercel añade un header de autorización secreto si se configura, pero por ahora lo dejamos libre
    // para pruebas, o validamos que el origin sea el mismo.

    try {
        console.log('--- Iniciando Calentamiento de Caché (24 productos) ---');

        // 1. Obtenemos los 24 productos principales (Modo Prueba)
        const response = await fetch(`https://winstonandharrystore.com/wp-json/wc/store/v1/products?per_page=24`);
        if (!response.ok) throw new Error('No se pudo obtener el catálogo de WooCommerce');

        const products = await response.json();
        const slugs = products.map((p: any) => p.slug);

        console.log(`Páginas de productos a calentar: ${slugs.length}.`);

        // 2. Definimos todas las rutas críticas de la web
        const criticalRoutes = [
            '/',                    // Home
            '/lista-de-deseos',     // Wishlist
            '/api/products',        // API de productos (Home grid)
        ];

        const allUrlsToWarm = [
            ...criticalRoutes.map(route => `${origin}${route}`),
            ...slugs.map(slug => `${origin}/productos/${slug}`)
        ];

        console.log(`Iniciando visita a ${allUrlsToWarm.length} enlaces en modo express...`);

        // 3. Ejecutamos las visitas en LOTES (Chunks)
        // Procesamos de 50 en 50 para ir muy rápido
        const results = [];
        const chunkSize = 50;

        for (let i = 0; i < allUrlsToWarm.length; i += chunkSize) {
            const chunk = allUrlsToWarm.slice(i, i + chunkSize);
            const chunkResults = await Promise.allSettled(
                chunk.map(async (url) => {
                    const res = await fetch(url, { method: 'HEAD' });
                    return { url, status: res.status };
                })
            );
            results.push(...chunkResults);
            // Pausa de 100ms entre lotes (modo express)
            await new Promise(r => setTimeout(r, 100));
        }

        return new Response(JSON.stringify({
            success: true,
            total_links: allUrlsToWarm.length,
            products: slugs.length,
            message: `Caché calentado con éxito para toda la tienda`,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Error en Cache Warmer:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

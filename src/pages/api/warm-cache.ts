import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const origin = url.origin;

    try {
        console.log('--- Iniciando Calentamiento de Caché (Optimizado) ---');

        // 1. Obtenemos la primera página para saber el total
        console.log('Obteniendo catálogo de WooCommerce...');
        const firstResponse = await fetch(`https://winstonandharrystore.com/wp-json/wc/store/v1/products?per_page=100&page=1`);

        if (!firstResponse.ok) {
            throw new Error(`Error obteniendo productos: ${firstResponse.status}`);
        }

        const totalPagesHeader = firstResponse.headers.get('X-WP-TotalPages');
        const totalPages = Math.min(parseInt(totalPagesHeader || '1'), 10); // Limitamos a 10 páginas (1000 productos) para velocidad

        let allProducts = await firstResponse.json();
        console.log(`Página 1 cargada. Total páginas detectadas: ${totalPagesHeader}.`);

        // 2. Cargamos el resto de páginas en PARALELO
        if (totalPages > 1) {
            const pageRequests = [];
            for (let p = 2; p <= totalPages; p++) {
                pageRequests.push(
                    fetch(`https://winstonandharrystore.com/wp-json/wc/store/v1/products?per_page=100&page=${p}`)
                        .then(res => res.ok ? res.json() : [])
                        .catch(() => [])
                );
            }
            const otherPages = await Promise.all(pageRequests);
            otherPages.forEach(chunk => {
                if (Array.isArray(chunk)) allProducts.push(...chunk);
            });
        }

        const slugs = allProducts.map((p: any) => p.slug);
        console.log(`Total de productos encontrados: ${slugs.length}.`);

        // 3. Definimos todas las rutas críticas
        const criticalRoutes = [
            '/',
            '/lista-de-deseos',
            '/api/products',
            '/api/reviews',
        ];

        const allUrlsToWarm = [
            ...criticalRoutes.map(route => `${origin}${route}`),
            ...slugs.map((slug: string) => `${origin}/productos/${slug}`)
        ];

        console.log(`Iniciando visita a ${allUrlsToWarm.length} enlaces en paralelo total...`);

        // 4. Ejecutamos las visitas en lotes MUY controlados para no saturar WordPress
        const CHUNK_SIZE = 20;
        const results = [];

        for (let i = 0; i < allUrlsToWarm.length; i += CHUNK_SIZE) {
            const chunk = allUrlsToWarm.slice(i, i + CHUNK_SIZE);

            if (i % (CHUNK_SIZE * 5) === 0) {
                console.log(`Procesando lote ${i} de ${allUrlsToWarm.length}...`);
            }

            const chunkResults = await Promise.allSettled(
                chunk.map(url => fetch(url, {
                    method: 'HEAD',
                    headers: { 'User-Agent': 'Vercel-Cache-Warmer' }
                }))
            );
            results.push(...chunkResults);

            // Pausa más corta para mantener el flujo sin saturar
            if (i + CHUNK_SIZE < allUrlsToWarm.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return new Response(JSON.stringify({
            success: true,
            total_links: allUrlsToWarm.length,
            products: slugs.length,
            message: `Cache warming completed for ${slugs.length} products and critical routes.`,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            }
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


export const prerender = false;
import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL, wcFetch } from '../../lib/woocommerce';

/** Timeout helper: rejects after ms miliseconds */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        )
    ]);
}

export const GET: APIRoute = async ({ url }) => {
    const query = (url.searchParams.get('q') || '').trim();
    const perPage = parseInt(url.searchParams.get('per_page') || '20');

    if (!query || query.length < 2) {
        return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const encoded = encodeURIComponent(query);
        let products: any[] = [];

        // ── PASO 1: Búsqueda por SKU (referencia exacta) ─────────────────────
        // Si el término no tiene espacios, asumimos que puede ser una referencia
        // (ej: "WS-001", "Bolton"). El endpoint ?sku= de WC v3 es exacto y rápido.
        if (!query.includes(' ')) {
            try {
                const skuData = await withTimeout(
                    wcFetch(`/products?sku=${encoded}&status=publish&per_page=10`),
                    2500
                );
                if (Array.isArray(skuData) && skuData.length > 0) {
                    // SKU encontrado: normalizar y retornar de inmediato
                    const normalized = normalizeProducts(skuData, false);
                    return new Response(JSON.stringify(normalized), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
                        }
                    });
                }
            } catch (_) { /* Si falla SKU, continúa con búsqueda normal */ }
        }

        // ── PASO 2: Búsqueda de texto — Store API + v3 en paralelo ───────────
        const [storeResult, v3Result] = await Promise.allSettled([
            withTimeout(
                fetch(`${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?search=${encoded}&per_page=${perPage}`).then(r => r.ok ? r.json() : []),
                3000
            ),
            withTimeout(
                wcFetch(`/products?search=${encoded}&per_page=${perPage}&status=publish`),
                3000
            )
        ]);

        const seenIds = new Set<number>();

        // Procesar Store API (sin auth, más rápida)
        if (storeResult.status === 'fulfilled' && Array.isArray(storeResult.value)) {
            storeResult.value.forEach((p: any) => {
                if (!seenIds.has(p.id)) {
                    products.push({ ...p, _source: 'store' });
                    seenIds.add(p.id);
                }
            });
        }

        // Procesar v3 (con auth, busca también en SKU y descripción)
        if (v3Result.status === 'fulfilled' && Array.isArray(v3Result.value)) {
            v3Result.value.forEach((p: any) => {
                if (!seenIds.has(p.id)) {
                    products.push({ ...p, _source: 'v3' });
                    seenIds.add(p.id);
                }
            });
        }

        // ── PASO 3: Solo si hay pocos resultados, busca en taxonomías ────────
        if (products.length < 3) {
            try {
                const [categories, tags] = await Promise.allSettled([
                    withTimeout(wcFetch(`/products/categories?search=${encoded}&per_page=3`), 2000),
                    withTimeout(wcFetch(`/products/tags?search=${encoded}&per_page=3`), 2000)
                ]);

                const extraTasks: Promise<any>[] = [];

                if (categories.status === 'fulfilled' && Array.isArray(categories.value) && categories.value.length > 0) {
                    extraTasks.push(
                        withTimeout(
                            wcFetch(`/products?category=${categories.value[0].id}&per_page=8&status=publish&stock_status=instock`),
                            2000
                        )
                    );
                }

                if (tags.status === 'fulfilled' && Array.isArray(tags.value) && tags.value.length > 0) {
                    extraTasks.push(
                        withTimeout(
                            wcFetch(`/products?tag=${tags.value[0].id}&per_page=8&status=publish&stock_status=instock`),
                            2000
                        )
                    );
                }

                if (extraTasks.length > 0) {
                    const extraResults = await Promise.allSettled(extraTasks);
                    extraResults.forEach(r => {
                        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
                            r.value.forEach((p: any) => {
                                if (!seenIds.has(p.id)) {
                                    products.push({ ...p, _source: 'v3' });
                                    seenIds.add(p.id);
                                }
                            });
                        }
                    });
                }
            } catch (_) { /* Taxonomías fallaron, ignorar */ }
        }

        // Ordenar los resultados combinados por ID (los más altos son los más recientes)
        products.sort((a, b) => (b.id || 0) - (a.id || 0));

        const normalized = products
            .slice(0, 12) // Mostrar un máximo de 12 resultados al usuario
            .map(p => normalizeProduct(p, p._source === 'store'))
            .filter((p: any) => p.id && p.name);

        return new Response(JSON.stringify(normalized), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
            }
        });

    } catch (e: any) {
        console.error('[API Search] Error:', e.message);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

function normalizeProduct(p: any, isStoreApi: boolean): any {
    const minorUnit = isStoreApi ? (p.prices?.currency_minor_unit ?? 0) : 0;
    const divisor = Math.pow(10, minorUnit);

    let price = '0';
    let regularPrice = '0';

    if (isStoreApi) {
        const rawPrice = p.prices?.price || p.prices?.regular_price || '0';
        price = Math.round(Number(rawPrice) / divisor).toString();
        regularPrice = Math.round(Number(p.prices?.regular_price || rawPrice) / divisor).toString();
    } else {
        price = Math.round(parseFloat(p.price || p.regular_price || '0')).toString();
        regularPrice = Math.round(parseFloat(p.regular_price || p.price || '0')).toString();
    }

    return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price,
        regular_price: regularPrice,
        on_sale: isStoreApi
            ? (p.prices?.sale_price && p.prices.sale_price !== p.prices.price)
            : (p.on_sale || false),
        image: p.images?.[0]?.src || '',
        categories: (p.categories || []).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
    };
}

function normalizeProducts(products: any[], isStoreApi: boolean): any[] {
    return products
        .map(p => normalizeProduct(p, isStoreApi))
        .filter((p: any) => p.id && p.name);
}

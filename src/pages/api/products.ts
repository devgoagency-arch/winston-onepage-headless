export const prerender = false;
import type { APIRoute } from 'astro';
import { getProductBySlug, searchProducts } from '../../lib/woocommerce';
import {
    getSnapshotAllProducts,
    getSnapshotProductsByCategory,
    getSnapshotProductBySlug,
} from '../../lib/snapshot';

export const config = {
    maxDuration: 10,
};

// El detalle por slug se pide en segundo plano (la página ya se ve con el snapshot) y Woo tarda ~4 s.
// La búsqueda espera en línea al visitante, así que usa un límite más corto.
const SLUG_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms) en ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer !== undefined) clearTimeout(timer);
    });
}

export const GET: APIRoute = async ({ url }) => {
    const pageStr = url.searchParams.get('p') || url.searchParams.get('page') || '1';
    const page = Math.max(1, parseInt(pageStr, 10) || 1);
    const slug = url.searchParams.get('slug');
    const search = url.searchParams.get('search');

    try {
        console.log(`[API Products] Request: category=${url.searchParams.get('category')}, slug=${slug}, search=${search}`);

        // 0. BÚSQUEDA
        if (search) {
            const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10) || 20);
            try {
                const results = await withTimeout(
                    searchProducts(search, perPage),
                    SEARCH_TIMEOUT_MS,
                    'searchProducts'
                );
                return new Response(JSON.stringify(results), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
                    },
                });
            } catch (searchErr: any) {
                console.warn(`[API Products] Search failed/timed out for "${search}":`, searchErr?.message);
                return new Response(JSON.stringify([]), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store',
                    },
                });
            }
        }

        // 1. DETALLE DEL PRODUCTO INDIVIDUAL (en vivo hasta 8 s con respaldo del snapshot)
        if (slug) {
            let liveProduct: any = null;
            try {
                liveProduct = await withTimeout(
                    getProductBySlug(slug),
                    SLUG_TIMEOUT_MS,
                    `getProductBySlug(${slug})`
                );
            } catch (liveErr: any) {
                console.warn(`[API Products] Live slug lookup failed/timed out (${slug}):`, liveErr?.message);
            }

            if (liveProduct) {
                return new Response(JSON.stringify(liveProduct), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400',
                        'X-Data-Source': 'live',
                    },
                });
            }

            const snapshotProduct = getSnapshotProductBySlug(slug);
            if (snapshotProduct) {
                return new Response(JSON.stringify(snapshotProduct), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
                        'X-Data-Source': 'snapshot-fallback',
                    },
                });
            }

            console.warn(`[API Products] Slug not found: ${slug}`);
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // 2. LISTADO POR CATEGORÍA O TODOS (siempre desde snapshot, sin llamadas a WooCommerce)
        const categoryParam = url.searchParams.get('category')?.trim();
        const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') || '16', 10) || 16);
        const orderBy = url.searchParams.get('orderby') || 'date';
        const order = url.searchParams.get('order') || 'desc';
        const onSale = url.searchParams.get('on_sale') === 'true';
        const maxPrice = url.searchParams.get('max_price') || undefined;

        const allProducts =
            !categoryParam || categoryParam === 'all'
                ? getSnapshotAllProducts(perPage, page, orderBy, order, onSale, maxPrice)
                : getSnapshotProductsByCategory(categoryParam, perPage, page, orderBy, order, onSale, maxPrice);

        console.log(`[API Products] Returning ${allProducts.length} products from snapshot (Page: ${page}, PerPage: ${perPage})`);

        return new Response(JSON.stringify(allProducts), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
                'X-Data-Source': 'snapshot',
            },
        });
    } catch (error: any) {
        console.error('[API Products] Server Error:', error?.message);
        return new Response(
            JSON.stringify({ error: 'Internal Server Error', details: error?.message }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }
};

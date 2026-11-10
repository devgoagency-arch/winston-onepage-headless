export const prerender = false;
/**
 * /api/stock?ids=123,456 — Stock en vivo de las variaciones de varios productos.
 *
 * Lo usa el panel "añadir rápido" de ProductCard: una sola consulta por página de colección.
 * - Respuesta mínima: { [productId]: [{ id, color, size }] } solo con variaciones disponibles
 *   (WooCommerce no devuelve las agotadas por la Store API).
 * - Caché: navegador 2 min, CDN de Vercel 5 min + stale-while-revalidate 1 min.
 * - Límite de 5 s a WooCommerce; si falla responde 503 y la tarjeta usa el JSON estático.
 */
import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL } from '../../lib/woocommerce';

export const config = {
    maxDuration: 10,
};

const MAX_IDS = 60;
const TIMEOUT_MS = 5000; // WooCommerce tarda ~2 s con 16 productos; se pide al cargar la página, no al pasar el mouse

type StockVariation = { id: number; color: string | null; size: string | null };

// "Selecciona el Color: Verde, Selecciona una Talla: 45" -> { color: 'Verde', size: '45' }
function parseVariation(text: string): { color: string | null; size: string | null } {
    let color: string | null = null;
    let size: string | null = null;
    for (const part of String(text || '').split(',')) {
        const idx = part.indexOf(':');
        if (idx === -1) continue;
        const name = part.slice(0, idx).toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (name.includes('color')) color = value;
        else if (name.includes('talla') || name.includes('size') || name.includes('numero') || name.includes('número')) size = value;
    }
    return { color, size };
}

export const GET: APIRoute = async ({ url }) => {
    const ids = Array.from(new Set(
        (url.searchParams.get('ids') || '')
            .split(',')
            .map(s => parseInt(s, 10))
            .filter(n => Number.isInteger(n) && n > 0)
    )).sort((a, b) => a - b).slice(0, MAX_IDS);

    if (ids.length === 0) {
        return new Response(JSON.stringify({ error: 'ids requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const pageUrl = (page: number) =>
        `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?type=variation&parent=${ids.join(',')}` +
        `&per_page=100&page=${page}&_fields=id,parent,variation,is_in_stock`;

    try {
        const first = await fetch(pageUrl(1), { signal: controller.signal });
        if (!first.ok) throw new Error(`WC ${first.status}`);
        const totalPages = Math.min(parseInt(first.headers.get('x-wp-totalpages') || '1', 10) || 1, 10);
        const rows: any[] = await first.json();

        if (totalPages > 1) {
            const rest = await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, i) =>
                    fetch(pageUrl(i + 2), { signal: controller.signal }).then(r => {
                        if (!r.ok) throw new Error(`WC ${r.status}`);
                        return r.json();
                    })
                )
            );
            rest.forEach(page => rows.push(...page));
        }

        const result: Record<string, StockVariation[]> = {};
        for (const id of ids) result[id] = [];
        for (const v of rows) {
            if (!v?.is_in_stock || !result[v.parent]) continue;
            result[v.parent].push({ id: v.id, ...parseVariation(v.variation) });
        }

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=120',
                'Vercel-CDN-Cache-Control': 'max-age=300, stale-while-revalidate=60',
            },
        });
    } catch (err: any) {
        console.error('[api/stock] Error consultando WooCommerce:', err?.name === 'AbortError' ? 'timeout 3s' : err?.message);
        return new Response(JSON.stringify({ error: 'stock no disponible' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    } finally {
        clearTimeout(timer);
    }
};

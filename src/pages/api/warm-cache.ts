/**
 * /api/warm-cache — Cron diario 5AM
 *
 * NIVEL 3: Cache warming optimizado
 * - Precalienta productos, categorías y rutas críticas
 * - Lotes de 3 con 1s de pausa (más rápido que antes sin saturar WP)
 * - Usa la API autenticada (v3) para obtener slugs reales
 * - Registra tiempo total y fallos para diagnóstico
 */
import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ request }) => {
    const t0 = Date.now();
    const origin = new URL(request.url).origin;
    const CK = (import.meta.env.WC_CONSUMER_KEY || "").trim();
    const CS = (import.meta.env.WC_CONSUMER_SECRET || "").trim();

    // Solo permitir desde cron de Vercel o con token de admin
    const authHeader = request.headers.get('authorization') || '';
    const cronHeader = request.headers.get('x-vercel-cron') || '';
    const adminToken = import.meta.env.VERCEL_REVALIDATE_TOKEN || '';
    const queryToken = new URL(request.url).searchParams.get('token') || '';

    if (!cronHeader && queryToken !== adminToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    console.log('[WarmCache] Iniciando calentamiento de caché...');

    try {
        // ─── 1. Obtener todos los slugs de productos ─────────────────────────
        const productSlugs: string[] = [];
        let page = 1;
        while (true) {
            const url = `${PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish&stock_status=instock&fields=slug&consumer_key=${CK}&consumer_secret=${CS}`;
            const res = await fetch(url).catch(() => null);
            if (!res?.ok) break;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) break;
            data.forEach((p: any) => { if (p.slug) productSlugs.push(p.slug); });
            const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
            if (page >= totalPages || page >= 10) break; // máximo 1000 productos
            page++;
        }
        console.log(`[WarmCache] ${productSlugs.length} productos encontrados.`);

        // ─── 2. Obtener slugs de categorías ──────────────────────────────────
        const categorySlugs: string[] = [];
        const catRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products/categories?per_page=100&hide_empty=true&consumer_key=${CK}&consumer_secret=${CS}`).catch(() => null);
        if (catRes?.ok) {
            const cats = await catRes.json();
            if (Array.isArray(cats)) cats.forEach((c: any) => { if (c.slug) categorySlugs.push(c.slug); });
        }
        console.log(`[WarmCache] ${categorySlugs.length} categorías encontradas.`);

        // ─── 3. Construir lista de URLs a calentar ───────────────────────────
        const urlsToWarm = [
            `${origin}/`,
            `${origin}/lista-de-deseos`,
            ...productSlugs.map(slug => `${origin}/productos/${slug}`),
            ...categorySlugs.map(slug => `${origin}/categoria/${slug}`),
        ];

        console.log(`[WarmCache] Calentando ${urlsToWarm.length} URLs en lotes de 3...`);

        // ─── 4. Calentar en lotes de 3 con 1s de pausa ──────────────────────
        const CHUNK = 3;
        let ok = 0, failed = 0;

        for (let i = 0; i < urlsToWarm.length; i += CHUNK) {
            const chunk = urlsToWarm.slice(i, i + CHUNK);
            const results = await Promise.allSettled(
                chunk.map(url => fetch(url, {
                    headers: {
                        'User-Agent': 'WH-CacheWarmer/2.0',
                        'Cache-Control': 'no-cache', // Forzar regeneración
                    }
                }))
            );
            results.forEach(r => {
                if (r.status === 'fulfilled' && r.value.ok) ok++;
                else failed++;
            });
            if (i % 30 === 0) console.log(`[WarmCache] Progreso: ${i}/${urlsToWarm.length}`);
            if (i + CHUNK < urlsToWarm.length) await new Promise(r => setTimeout(r, 1000));
        }

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[WarmCache] ✅ Completado en ${elapsed}s — OK: ${ok}, Fallidos: ${failed}`);

        return new Response(JSON.stringify({
            success: true,
            products: productSlugs.length,
            categories: categorySlugs.length,
            total_urls: urlsToWarm.length,
            ok,
            failed,
            elapsed_seconds: parseFloat(elapsed),
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });

    } catch (error: any) {
        console.error('[WarmCache] Error:', error.message);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }
};

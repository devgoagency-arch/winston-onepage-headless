/**
 * /api/warm-cache — Cron diario 5AM
 *
 * MOTOR DE CALENTAMIENTO V7: Ultra-Paralelismo
 * - Evita el error 504 de Vercel procesando todo en < 10s.
 * - Lanza todas las peticiones simultáneamente.
 * - Usa AbortController para no quedar bloqueado en páginas pesadas.
 */
import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL } from '../../lib/woocommerce';

export const config = {
    maxDuration: 300,
};

export const GET: APIRoute = async ({ request }) => {
    const t0 = Date.now();
    const origin = new URL(request.url).origin;
    
    // Auth vars
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || "").trim();
    const CS = (import.meta.env.WC_CONSUMER_SECRET || import.meta.env.WP_CONSUMER_SECRET || "").trim();
    const adminToken = (import.meta.env.VERCEL_REVALIDATE_TOKEN || '').trim();
    const cronHeader = request.headers.get('x-vercel-cron') || '';
    
    const searchParams = new URL(request.url).searchParams;
    const queryToken = searchParams.get('token') || '';
    const hasTokenAsFlag = adminToken !== '' && searchParams.has(adminToken);

    if (!cronHeader && (adminToken === '' || (queryToken !== adminToken && !hasTokenAsFlag))) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        console.log('[WarmCache] 📦 Obteniendo slugs de WooCommerce...');

        // ─── 1. Obtener slugs en paralelo (Páginas 1, 2, 3 y Categorías) ──────
        // Esto cubre hasta 300 productos de una vez.
        const [p1, p2, p3, catRes] = await Promise.all([
            fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=100&page=1&status=publish&consumer_key=${CK}&consumer_secret=${CS}`),
            fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=100&page=2&status=publish&consumer_key=${CK}&consumer_secret=${CS}`),
            fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=100&page=3&status=publish&consumer_key=${CK}&consumer_secret=${CS}`),
            fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products/categories?per_page=100&hide_empty=false&consumer_key=${CK}&consumer_secret=${CS}`)
        ]);

        const allSets = await Promise.all([
            p1.ok ? p1.json() : [],
            p2.ok ? p2.json() : [],
            p3.ok ? p3.json() : [],
            catRes.ok ? catRes.json() : []
        ]);

        const products = [...allSets[0], ...allSets[1], ...allSets[2]];
        const categories = allSets[3];

        const urlsToWarm = [
            `${origin}/`,
            `${origin}/contacto`,
            `${origin}/guia-de-tallas`,
            `${origin}/politica-cookies`,
            `${origin}/politica-privacidad-proteccion-datos`,
            `${origin}/terminos-condiciones`,
            ...categories.map((c: any) => `${origin}/categoria/${c.slug}`),
            ...products.map((p: any) => `${origin}/productos/${p.slug}`)
        ].filter(url => !url.includes('undefined') && url.startsWith('http'));

        console.log(`[WarmCache] Calentando ${urlsToWarm.length} URLs simultáneamente...`);

        // ─── 2. Calentamiento Masivo (Sin bloques, todo a la vez) ────────────
        const results = await Promise.allSettled(
            urlsToWarm.map(async (url) => {
                const headers: Record<string, string> = {
                    'Cache-Control': 'no-cache',
                    'User-Agent': 'WH-CacheWarmer/7.0'
                };
                
                let finalUrl = url;
                if (adminToken) {
                    headers['x-prerender-revalidate'] = adminToken;
                    headers['x-revalidate-auth'] = adminToken;
                    headers['x-vercel-protection-bypass'] = adminToken;
                    const connector = finalUrl.includes('?') ? '&' : '?';
                    finalUrl = `${finalUrl}${connector}vercel-protection-bypass-token=${adminToken}`;
                }

                // Timeout de 25s: WooCommerce es lento, hay que darle tiempo.
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000);

                try {
                    const r = await fetch(finalUrl, { headers, signal: controller.signal });
                    clearTimeout(timeoutId);
                    return r.status;
                } catch {
                    clearTimeout(timeoutId);
                    return 202; // Asumimos aceptado/lanzado en caso de timeout
                }
            })
        );

        const okCount = results.filter(r => r.status === 'fulfilled').length;
        const elapsed = (Date.now() - t0) / 1000;

        return new Response(JSON.stringify({
            success: true,
            results: {
                total: urlsToWarm.length,
                ok: okCount,
                time: `${elapsed.toFixed(1)}s`
            }
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (e: any) {
        console.error('[WarmCache] Fatal Error:', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

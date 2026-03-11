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
    
    // Auth vars
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || "").trim();
    const CS = (import.meta.env.WC_CONSUMER_SECRET || import.meta.env.WP_CONSUMER_SECRET || "").trim();
    const adminToken = (import.meta.env.VERCEL_REVALIDATE_TOKEN || '').trim();
    const cronHeader = request.headers.get('x-vercel-cron') || '';
    
    // Obtener token de la query de forma flexible
    const searchParams = new URL(request.url).searchParams;
    const queryToken = searchParams.get('token') || '';
    // También aceptamos el token como una "flag" sin valor (ej: ?MiToken)
    const hasTokenAsFlag = adminToken !== '' && searchParams.has(adminToken);

    // Seguridad: solo cron de Vercel o token de admin válido
    if (!cronHeader && (adminToken === '' || (queryToken !== adminToken && !hasTokenAsFlag))) {
        console.warn('[WarmCache] ❌ Intento de acceso no autorizado. Token recibido:', queryToken ? 'presente' : 'ausente');
        return new Response(JSON.stringify({ 
            error: 'Unauthorized', 
            hint: 'Asegúrate de incluir ?token=TU_TOKEN o configurar VERCEL_REVALIDATE_TOKEN en Vercel.' 
        }), { status: 401 });
    }

    console.log('[WarmCache] 🚀 Iniciando calentamiento de caché...');

    try {
        // ─── 1. Obtener slugs de productos (v3 Auth) ────────────────────────
        const productSlugs: string[] = [];
        const productRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=100&status=publish&stock_status=instock&consumer_key=${CK}&consumer_secret=${CS}`);
        
        if (productRes.ok) {
            const products = await productRes.json();
            if (Array.isArray(products)) {
                products.forEach((p: any) => { if (p.slug) productSlugs.push(p.slug); });
            }
        }

        // ─── 2. Obtener slugs de categorías ──────────────────────────────────
        const categorySlugs: string[] = [];
        const catRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products/categories?per_page=100&hide_empty=true&consumer_key=${CK}&consumer_secret=${CS}`);
        
        if (catRes.ok) {
            const cats = await catRes.json();
            if (Array.isArray(cats)) {
                cats.forEach((c: any) => { if (c.slug) categorySlugs.push(c.slug); });
            }
        }

        // ─── 3. URLs críticas y dinámicas ───────────────────────────────────
        const urlsToWarm = [
            `${origin}/`,
            ...categorySlugs.map(slug => `${origin}/categoria/${slug}`),
            ...productSlugs.map(slug => `${origin}/productos/${slug}`)
        ];

        console.log(`[WarmCache] Calentando ${urlsToWarm.length} URLs...`);

        // ─── 4. Calentamiento en paralelo controlado ────────────────────────
        let okCount = 0;
        let errCount = 0;
        
        // Procesamos de 5 en 5 para no saturar
        const CHUNK_SIZE = 5;
        for (let i = 0; i < urlsToWarm.length; i += CHUNK_SIZE) {
            const chunk = urlsToWarm.slice(i, i + CHUNK_SIZE);
            const results = await Promise.allSettled(
                chunk.map(url => {
                    const headers: Record<string, string> = {
                        'Cache-Control': 'no-cache',
                        'User-Agent': 'WH-CacheWarmer/6.0'
                    };
                    
                    let finalUrl = url;

                    // Si tenemos token, usamos el bypass redundante (Header + Query)
                    if (adminToken) {
                        headers['x-prerender-revalidate'] = adminToken;
                        headers['x-revalidate-auth'] = adminToken;
                        headers['x-vercel-protection-bypass'] = adminToken;
                        
                        // Añadir bypass por query param (algunos proxies/WAF de Vercel lo prefieren así)
                        const connector = finalUrl.includes('?') ? '&' : '?';
                        finalUrl += `${connector}vercel-protection-bypass-token=${adminToken}`;
                    }

                    return fetch(finalUrl, { headers });
                })
            );
            
            results.forEach((r, idx) => {
                const url = chunk[idx];
                if (r.status === 'fulfilled') {
                    if (r.value.ok) {
                        okCount++;
                    } else {
                        console.error(`[WarmCache] ❌ Falló: ${url} | Status: ${r.value.status} ${r.value.statusText}`);
                        errCount++;
                    }
                } else {
                    console.error(`[WarmCache] ❌ Error de red: ${url} | Motivo: ${r.reason}`);
                    errCount++;
                }
            });
            
            // Pausa de 500ms entre lotes
            if (i + CHUNK_SIZE < urlsToWarm.length) await new Promise(r => setTimeout(r, 500));
        }

        const elapsed = (Date.now() - t0) / 1000;
        console.log(`[WarmCache] ✅ Finalizado. OK: ${okCount}, Errores: ${errCount}, Tiempo: ${elapsed.toFixed(1)}s`);

        return new Response(JSON.stringify({
            success: true,
            origin,
            results: {
                total: urlsToWarm.length,
                ok: okCount,
                errors: errCount,
                time: `${elapsed.toFixed(1)}s`
            }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        console.error('[WarmCache] Error fatal:', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

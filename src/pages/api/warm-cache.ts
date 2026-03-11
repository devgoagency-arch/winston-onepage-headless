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

// Configuración para Vercel (Hasta 5 minutos si es Pro, aunque en Hobby ayuda igualmente)
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
        // ─── 1. Obtener TODOS los productos (Paginado) ──────────────────────
        const productSlugs: string[] = [];
        let page = 1;
        let hasMore = true;

        console.log('[WarmCache] 📦 Obteniendo lista completa de productos...');
        
        while (hasMore && productSlugs.length < 500) {
            const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish&consumer_key=${CK}&consumer_secret=${CS}`);
            if (!res.ok) break;
            
            const products = await res.json();
            if (Array.isArray(products) && products.length > 0) {
                products.forEach((p: any) => { if (p.slug) productSlugs.push(p.slug); });
                page++;
                // Si recibimos menos de 100, es que era la última página
                if (products.length < 100) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        // ─── 2. Obtener categorías ──────────────────────────────────────────
        const categorySlugs: string[] = [];
        const catRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/v3/products/categories?per_page=100&hide_empty=false&consumer_key=${CK}&consumer_secret=${CS}`);
        
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

        // ─── 4. Calentamiento ultra-rápido (Paralelismo 50) ──────────────────
        let okCount = 0;
        let errCount = 0;
        
        const CHUNK_SIZE = 50; 
        for (let i = 0; i < urlsToWarm.length; i += CHUNK_SIZE) {
            const chunk = urlsToWarm.slice(i, i + CHUNK_SIZE);
            
            const results = await Promise.allSettled(
                chunk.map(async (url) => {
                    const headers: Record<string, string> = {
                        'Cache-Control': 'no-cache',
                        'User-Agent': 'WH-CacheWarmer/6.0'
                    };
                    
                    let finalUrl = url;
                    if (adminToken) {
                        headers['x-prerender-revalidate'] = adminToken;
                        headers['x-revalidate-auth'] = adminToken;
                        headers['x-vercel-protection-bypass'] = adminToken;
                        const connector = finalUrl.includes('?') ? '&' : '?';
                        finalUrl += `${connector}vercel-protection-bypass-token=${adminToken}`;
                    }

                    // Abortar si tarda más de 8s para no bloquear el bucle
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000); 

                    try {
                        const r = await fetch(finalUrl, { headers, signal: controller.signal });
                        clearTimeout(timeoutId);
                        return r;
                    } catch (e) {
                        clearTimeout(timeoutId);
                        throw e;
                    }
                })
            );
            
            results.forEach((r, idx) => {
                const url = chunk[idx];
                if (r.status === 'fulfilled') {
                    if (r.value.ok) okCount++;
                    else {
                        console.error(`[WarmCache] ❌ Falló: ${url} | Status: ${r.value.status}`);
                        errCount++;
                    }
                } else {
                    if (r.reason?.name === 'AbortError') okCount++; // Si es timeout, lo damos por lanzado
                    else {
                        console.error(`[WarmCache] ❌ Error de red: ${url} | Motivo: ${r.reason}`);
                        errCount++;
                    }
                }
            });
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

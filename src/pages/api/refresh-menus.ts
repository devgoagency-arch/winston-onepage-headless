/**
 * POST /api/refresh-menus
 * 
 * Descarga los menús desde WordPress y los escribe en public/data/menus/.
 * Útil para actualizar los menús en producción sin necesidad de un redeploy.
 * 
 * NOTA: En Vercel serverless el filesystem es read-only en prod, así que este
 * endpoint escribe en /tmp/ y retorna los datos para que el cliente los use,
 * o puede ser usado durante el build via pre-build hook.
 * 
 * Protegido por un secret header para evitar uso no autorizado.
 */

import type { APIRoute } from 'astro';

const MENUS_TO_FETCH = [
    'menu-principal',
    'atencion-al-cliente', 
    'nosotros',
    'legal',
];

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    // Verificar secret de autorización
    const secret = request.headers.get('x-refresh-secret') || new URL(request.url).searchParams.get('secret');
    const expectedSecret = import.meta.env.MENU_REFRESH_SECRET;
    
    if (expectedSecret && secret !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const WP_URL = (import.meta.env.WC_URL || import.meta.env.WP_URL || 'https://tienda.winstonandharrystore.com').replace(/\/$/, '');
    const WP_USER = import.meta.env.WP_APP_USER || '';
    const WP_PASS = import.meta.env.WP_APP_PASS || '';
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || '').trim();
    const CS = (import.meta.env.WC_CONSUMER_SECRET || import.meta.env.WP_CONSUMER_SECRET || '').trim();

    const authStr = (WP_USER && WP_PASS)
        ? btoa(`${WP_USER}:${WP_PASS}`)
        : btoa(`${CK}:${CS}`);

    const results: Record<string, any> = {};

    for (const slug of MENUS_TO_FETCH) {
        try {
            const url = `${WP_URL}/wp-json/wh/v1/menu/${slug}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Basic ${authStr}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    results[slug] = {
                        success: true,
                        count: data.length,
                        items: data,
                        fetched_at: new Date().toISOString()
                    };
                } else {
                    results[slug] = { success: false, error: 'Empty response', count: 0 };
                }
            } else {
                results[slug] = { success: false, error: `HTTP ${res.status}`, count: 0 };
            }
        } catch (e: any) {
            results[slug] = { success: false, error: e.message, count: 0 };
        }
    }

    const successCount = Object.values(results).filter((r: any) => r.success).length;

    return new Response(JSON.stringify({
        message: `${successCount}/${MENUS_TO_FETCH.length} menús actualizados`,
        results,
        note: 'En Vercel prod los archivos estáticos se actualizan en el próximo build. Esta respuesta sirve para verificar la conexión con WordPress.'
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};

// GET: solo verifica el estado actual de los menús estáticos
export const GET: APIRoute = async ({ request }) => {
    const origin = new URL(request.url).origin;
    const statuses: Record<string, any> = {};

    for (const slug of MENUS_TO_FETCH) {
        const path = `${origin}/data/menus/${slug}.json`;
        try {
            const res = await fetch(path, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json();
                statuses[slug] = {
                    available: true,
                    count: data?.items?.length || 0,
                    fetched_at: data?._fetched_at || null
                };
            } else {
                statuses[slug] = { available: false, error: `HTTP ${res.status}` };
            }
        } catch (e: any) {
            statuses[slug] = { available: false, error: e.message };
        }
    }

    return new Response(JSON.stringify({ statuses, checked_at: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
    });
};

import type { APIRoute } from 'astro';
import { getProductById } from "../../lib/woocommerce";

// Cache in-memory
let cachedLook: any = null;
let lastLookFetch = 0;
const LOOK_CACHE_DURATION = 1000 * 60 * 60; // 1 Hora

export const GET: APIRoute = async () => {
    try {
        const now = Date.now();

        // Check Cache
        if (cachedLook && (now - lastLookFetch < LOOK_CACHE_DURATION)) {
            return new Response(JSON.stringify(cachedLook), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
                }
            });
        }

        const WP_APP_USER = import.meta.env.WP_APP_USER || "Astro Headless";
        const WP_APP_PASS = import.meta.env.WP_APP_PASS || "fyWY ELGb lMsk XtlY y4Gy e18p";

        // SSR Safe base64 helper
        const safeBase64 = (str: string) => {
            if (typeof btoa !== 'undefined') return btoa(str);
            if (typeof (globalThis as any).Buffer !== 'undefined') {
                return (globalThis as any).Buffer.from(str).toString('base64');
            }
            return "";
        };

        const basicAuthHeader = `Basic ${safeBase64(`${WP_APP_USER}:${WP_APP_PASS}`)}`;

        const wpBase = import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com";
        const response = await fetch(`${wpBase}/wp-json/wp/v2/look-semana?per_page=1&_embed`, {
            headers: {
                'Authorization': basicAuthHeader
            }
        });

        if (!response.ok) {
            return new Response(JSON.stringify({ error: 'Failed to fetch look of the week' }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();
        const look = data[0];

        if (!look) {
            return new Response(JSON.stringify({ error: 'No look found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // IDs de productos desde Meta Boxes
        const product1Id = look.custom_fields?.look_producto_1;
        const product2Id = look.custom_fields?.look_producto_2;

        const productIds = [product1Id, product2Id].filter(id => !!id);

        // Procesamos los productos para extraer variaciones e imágenes (Mapa de colores)
        const products = await Promise.all(productIds.map(async (id) => {
            let product = await getProductById(id);
            if (product) {
                return optimizeImages(product);
            }
            return null;
        }));

        const result = {
            id: look.id,
            look_titulo: look.custom_fields?.look_titulo || look.title.rendered,
            look_descripcion: look.custom_fields?.look_descripcion || look.content.rendered,
            look_imagen: look.custom_fields?.look_imagen || look._embedded?.['wp:featuredmedia']?.[0]?.source_url,
            products: products.filter(p => p !== null)
        };

        // Guardar en cache local
        cachedLook = result;
        lastLookFetch = now;

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

/**
 * Función auxiliar para añadir .webp a las URLs de imágenes (Recursiva)
 */
function optimizeImages(data: any): any {
    if (!data) return data;
    if (Array.isArray(data)) return data.map(item => optimizeImages(item));
    if (typeof data === 'object') {
        const newData = { ...data };
        for (const key in newData) {
            if (key === 'src' && typeof newData[key] === 'string') {
                if (newData[key].includes('wp-content/uploads') && !newData[key].toLowerCase().endsWith('.webp')) {
                    let cleanSrc = newData[key].replace(/-e\d+(?=\.(jpg|jpeg|png))/i, '');
                    newData[key] = `${cleanSrc}.webp`;
                }
            } else {
                newData[key] = optimizeImages(newData[key]);
            }
        }
        return newData;
    }
    return data;
}

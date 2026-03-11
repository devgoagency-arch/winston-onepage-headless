import type { APIRoute } from 'astro';
import { getProductBySlug } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const slug = url.searchParams.get('slug') || 'camisa-button-under-linea-gruesa';
    
    try {
        const product = await getProductBySlug(slug);
        
        if (!product) {
            return new Response(JSON.stringify({ error: 'Producto no encontrado', slug }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Devolvemos info relevante para debuggear
        const debugInfo = {
            id: product.id,
            name: product.name,
            type: product.type,
            stock_status: product.stock_status,
            variationsCount: product.variations?.length || 0,
            variations: product.variations?.map((v: any) => ({
                id: v.id,
                stock_status: v.stock_status,
                attributes: v.attributes
            })) || 'SIN VARIACIONES',
            attributes: product.attributes?.map((a: any) => ({
                id: a.id,
                name: a.name,
                terms: a.terms?.map((t: any) => t.slug)
            }))
        };

        return new Response(JSON.stringify(debugInfo, null, 2), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

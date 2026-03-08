import type { APIRoute } from 'astro';
import { getProductBySlug, getProductsByCategory } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const pageStr = url.searchParams.get('p') || url.searchParams.get('page') || '1';
    const page = parseInt(pageStr);
    const slug = url.searchParams.get('slug');

    try {
        // 1. DETALLE DEL PRODUCTO INDIVIDUAL
        if (slug) {
            let product = await getProductBySlug(slug);

            if (!product) {
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
            }

            return new Response(JSON.stringify(product), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
                }
            });
        }

        // 2. LISTADO POR CATEGORÍA
        const category = url.searchParams.get('category') || '63';
        const orderBy = url.searchParams.get('orderby') || 'date';
        const order = url.searchParams.get('order') || 'desc';
        const onSale = url.searchParams.get('on_sale') === 'true';
        const attribute = url.searchParams.get('attribute') || undefined;
        const attributeTerm = url.searchParams.get('attribute_term') || undefined;

        // category can be a comma-separated list of IDs like "63,249"
        let allProducts = await getProductsByCategory(category, 100, page, orderBy, order, onSale, attribute, attributeTerm);

        return new Response(JSON.stringify(allProducts), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};

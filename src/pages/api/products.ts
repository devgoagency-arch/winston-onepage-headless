export const prerender = false;
import type { APIRoute } from 'astro';
import { getProductBySlug, getProductsByCategory, getAllProducts, searchProducts } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const pageStr = url.searchParams.get('p') || url.searchParams.get('page') || '1';
    const page = parseInt(pageStr);
    const slug = url.searchParams.get('slug');
    const search = url.searchParams.get('search');

    try {
        console.log(`[API Products] Request: category=${url.searchParams.get('category')}, slug=${url.searchParams.get('slug')}, search=${search}`);

        // 0. BÚSQUEDA
        if (search) {
            const results = await searchProducts(search, parseInt(url.searchParams.get('per_page') || '20'));
            return new Response(JSON.stringify(results), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
                }
            });
        }
        // 1. DETALLE DEL PRODUCTO INDIVIDUAL
        if (slug) {
            let product = await getProductBySlug(slug);

            if (!product) {
                console.warn(`[API Products] Slug not found: ${slug}`);
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
            }

            return new Response(JSON.stringify(product), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
                }
            });
        }

        // 2. LISTADO POR CATEGORÍA O TODOS
        const categoryParam = url.searchParams.get('category');
        const perPage = parseInt(url.searchParams.get('per_page') || '16');
        const orderBy = url.searchParams.get('orderby') || 'date';
        const order = url.searchParams.get('order') || 'desc';
        const onSale = url.searchParams.get('on_sale') === 'true';
        const attribute = url.searchParams.get('attribute') || undefined;
        const attributeTerm = url.searchParams.get('attribute_term') || undefined;
        const maxPrice = url.searchParams.get('max_price') || undefined;

        let allProducts = [];
        try {
            if (!categoryParam || categoryParam === 'all') {
                allProducts = await getAllProducts(perPage, page, orderBy, order, onSale, maxPrice);
            } else {
                allProducts = await getProductsByCategory(categoryParam, perPage, page, orderBy, order, onSale, attribute, attributeTerm, maxPrice);
            }
        } catch (fetchErr: any) {
            console.warn(`[API Products] WooCommerce fetch failed, attempting local catalog fallback:`, fetchErr.message);
            try {
                const fs = await import('node:fs');
                const path = await import('node:path');
                const catSlug = categoryParam === 'all' || !categoryParam ? 'tienda' : categoryParam;
                const filePath = path.join(process.cwd(), 'public', 'data', 'catalog', `${catSlug}-p${page}.json`);
                if (fs.existsSync(filePath)) {
                    allProducts = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    console.log(`[API Products] Loaded fallback static catalog for ${catSlug} page ${page}`);
                } else {
                    throw fetchErr;
                }
            } catch (fsErr) {
                throw fetchErr;
            }
        }
        // Ordenamiento de productos nuevos (<= 30 días) primero
        if (allProducts && allProducts.length > 0) {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            
            const newProducts: any[] = [];
            const otherProducts: any[] = [];
            
            allProducts.forEach((p: any) => {
                if (p.date_created) {
                    const createdDate = new Date(p.date_created);
                    if (createdDate >= thirtyDaysAgo) {
                        newProducts.push(p);
                        return;
                    }
                }
                otherProducts.push(p);
            });
            
            newProducts.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());
            allProducts = [...newProducts, ...otherProducts];
        }

        console.log(`[API Products] Returning ${allProducts?.length || 0} products (Page: ${page}, PerPage: ${perPage})`);

        return new Response(JSON.stringify(allProducts), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
            }
        });

    } catch (error: any) {
        console.error('[API Products] Server Error:', error.message);
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 });
    }
};

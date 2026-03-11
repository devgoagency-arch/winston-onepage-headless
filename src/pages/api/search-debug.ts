import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const search = url.searchParams.get('q') || 'Camisa';
    try {
        const wpBase = PUBLIC_WP_URL;
        const res = await fetch(`${wpBase}/wp-json/wc/store/v1/products?search=${encodeURIComponent(search)}&per_page=20`);
        const products = await res.json();
        return new Response(JSON.stringify(products), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

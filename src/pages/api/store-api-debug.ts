import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL } from '../../lib/woocommerce';

export const GET: APIRoute = async () => {
    try {
        const url = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?per_page=5`;
        console.log(`[Store API Debug] Fetching: ${url}`);
        const res = await fetch(url);
        const data = await res.json();
        return new Response(JSON.stringify({ status: res.status, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

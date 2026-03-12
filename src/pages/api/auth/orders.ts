
import { wcFetch } from "../../../lib/woocommerce";

export async function GET({ url }: { url: URL }) {
    const customerId = url.searchParams.get("customerId");

    if (!customerId) {
        return new Response(JSON.stringify({ error: "No customer ID provided" }), { status: 400 });
    }

    try {
        // Buscamos los pedidos del cliente usando la API de WooCommerce v3
        const orders = await wcFetch(`/orders?customer=${customerId}&per_page=20&orderby=date&order=desc`);
        
        return new Response(JSON.stringify(orders || []), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

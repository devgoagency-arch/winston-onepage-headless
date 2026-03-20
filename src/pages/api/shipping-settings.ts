export const prerender = false;
import type { APIRoute } from 'astro';
import { wcFetch } from '../../lib/woocommerce';

export const GET: APIRoute = async () => {
    try {
        // Obtenemos los métodos de la zona 1 (Colombia) que es la principal
        const methods = await wcFetch('shipping/zones/1/methods');
        
        if (!Array.isArray(methods)) {
            throw new Error('Configuración de envío no encontrada');
        }

        const flatRate = methods.find(m => m.method_id === 'flat_rate' && m.enabled);
        const freeShipping = methods.find(m => m.method_id === 'free_shipping' && m.enabled);

        return new Response(JSON.stringify({
            flat_rate: parseFloat(flatRate?.settings?.cost?.value || '0'),
            free_shipping_threshold: parseFloat(freeShipping?.settings?.min_amount?.value || '0')
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600' // Cache de 1 hora
            }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

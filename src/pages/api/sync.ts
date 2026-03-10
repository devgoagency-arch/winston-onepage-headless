import type { APIRoute } from 'astro';

// SOPORTE PARA NAVEGADORES Y PRUEBAS CORS
export const OPTIONS: APIRoute = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-WC-Webhook-Topic, X-WC-Webhook-Signature'
        }
    });
};

// SOPORTE PARA ENTRAR DESDE EL NAVEGADOR (PÁGINA VIVA)
export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({ status: "ALIVE", mode: "Ready for WooCommerce" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

// RECEPTOR DE WOOCOMMERCE (TOTALMENTE ABIERTO PARA VINCULACIÓN)
export const POST: APIRoute = async ({ request }) => {
    console.log('[Sync] Petición recibida de WooCommerce');
    
    // Devolvemos 200 OK inmediatamente. 
    // Esto fuerza a WooCommerce a aceptar la URL pase lo que pase.
    return new Response(JSON.stringify({ 
        success: true, 
        message: "Winston Sync Active" 
    }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};

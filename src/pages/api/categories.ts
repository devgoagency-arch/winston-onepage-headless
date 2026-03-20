export const prerender = false;
import type { APIRoute } from 'astro';
import { wcFetch } from '../../lib/woocommerce';

export const GET: APIRoute = async () => {
  try {
    // Obtenemos todas las categorías (hasta 100 para cubrir el catálogo)
    const categories = await wcFetch("/products/categories?per_page=100&hide_empty=false");
    
    return new Response(JSON.stringify(categories), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // Cache de 1 hora
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Fallo al obtener categorías' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

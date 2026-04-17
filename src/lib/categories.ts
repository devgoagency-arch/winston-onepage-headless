import { wcFetch, PUBLIC_WP_URL } from "./woocommerce";

/**
 * Obtiene los datos de la sección de categorías del Home
 * CPT: 'home_categories_sec'
 */
export async function getHomeCategories() {
    try {
        const data = await wcFetch('wp/v2/home_categories_sec?per_page=1');
        
        if (data && Array.isArray(data) && data.length > 0) {
            const post = data[0];
            
            // Según la inspección de la API, los datos están en el objeto raíz o campos específicos
            return {
                title: post.title?.rendered || "ROPA Y ZAPATOS PARA HOMBRE",
                subtitle: post.content?.rendered || "Todo lo que necesita el hombre colombiano que viste con criterio.",
                // El campo 'categories' contiene el arreglo de objetos con id, name, slug, image
                categories: post.categories || post.acf?.categories || []
            };
        }
    } catch (e) {
        console.warn("[Categories API] Error fetching home categories:", e);
    }

    // Fallback público directo
    try {
        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/home_categories_sec?per_page=1`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const post = data[0];
                return {
                    title: post.title?.rendered,
                    subtitle: post.content?.rendered,
                    categories: post.categories || post.acf?.categories || []
                };
            }
        }
    } catch (e) {}

    return null;
}

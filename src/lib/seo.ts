
import { PUBLIC_WP_URL } from "./woocommerce";

/**
 * Sanitiza metadatos de RankMath para Headless
 * - Reemplaza URLs de WordPress por las del sitio actual
 * - Asegura que el canonical apunte al dominio principal
 */
export function sanitizeSEO(seoData: any, currentPath: string, siteUrl: string) {
    if (!seoData) return null;

    // 1. Limpiar el título y descripción (quitar shortcodes de WP si hubieran)
    let title = seoData.title || "";
    let description = seoData.description || "";

    // 2. Reemplazar subdominio de WP por el Main en descripciones
    const wpUrl = PUBLIC_WP_URL.replace(/\/$/, "");
    const cleanSiteUrl = siteUrl.replace(/\/$/, "");
    
    const replacementRegex = new RegExp(wpUrl, 'g');
    
    description = description.replace(replacementRegex, cleanSiteUrl);

    // 3. Generar Canonical propio (Ignorar el de RankMath)
    // Esto es clave para que Google indexe Astro y no el subdominio
    const canonical = `${cleanSiteUrl}${currentPath === '/' ? '' : currentPath}`;

    // 4. OpenGraph Images (Asegurar que sean absolutas)
    let ogImage = seoData.opengraph_image || "";
    if (ogImage && !ogImage.startsWith('http')) {
        ogImage = `${wpUrl}${ogImage}`;
    }

    return {
        title,
        description,
        canonical,
        ogTitle: seoData.opengraph_title || title,
        ogDescription: seoData.opengraph_description || description,
        ogImage,
        ogType: seoData.opengraph_type || 'website'
    };
}

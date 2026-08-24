
import { PUBLIC_WP_URL } from "./woocommerce";

/**
 * Sanitiza metadatos de RankMath para Headless
 * - Reemplaza URLs de WordPress por las del sitio actual
 * - Asegura que el canonical apunte al dominio principal
 */
export function sanitizeSEO(seoData: any, currentPath: string, siteUrl: string) {
    if (!seoData) return null;

    // 1. Extraer título y descripción tolerando RankMath / Yoast / default
    let title = seoData.title || seoData.rank_math_title || seoData.yoast_head_json?.title || "";
    let description = seoData.description || seoData.rank_math_description || seoData.yoast_head_json?.description || "";

    // 2. Reemplazar subdominio de WP por el Main en descripciones
    const wpUrl = PUBLIC_WP_URL.replace(/\/$/, "");
    const cleanSiteUrl = "https://www.winstonandharrystore.com";
    
    const replacementRegex = new RegExp(wpUrl, 'g');
    
    description = description.replace(replacementRegex, cleanSiteUrl);

    // 3. Generar / Sanitizar Canonical URL
    let rawCanonical = seoData.canonical || seoData.rank_math_canonical || seoData.yoast_head_json?.canonical || "";
    let canonical = "";

    if (rawCanonical && typeof rawCanonical === "string") {
        // Reemplazar subdominio backend o dominio sin www por www.winstonandharrystore.com
        canonical = rawCanonical
            .replace(/https?:\/\/tienda\.winstonandharrystore\.com/g, "https://www.winstonandharrystore.com")
            .replace(/https?:\/\/winstonandharrystore\.com/g, "https://www.winstonandharrystore.com");
    } else {
        // Fallback construyendo con la ruta actual
        let normalizedPath = currentPath;
        if (normalizedPath !== '/' && normalizedPath.endsWith('/')) {
            normalizedPath = normalizedPath.slice(0, -1);
        }
        canonical = `${cleanSiteUrl}${normalizedPath === '/' ? '' : normalizedPath}`;
    }

    // Asegurar que use HTTPS y www.
    if (canonical.includes("winstonandharrystore.com") && !canonical.includes("www.")) {
        canonical = canonical.replace("winstonandharrystore.com", "www.winstonandharrystore.com");
    }

    // Quitar la barra inclinada final (trailing slash) excepto si es la raíz
    if (canonical !== "https://www.winstonandharrystore.com" && canonical !== "https://www.winstonandharrystore.com/" && canonical.endsWith("/")) {
        canonical = canonical.slice(0, -1);
    }

    // 4. OpenGraph Images (Asegurar que sean absolutas y con www)
    let ogImage = seoData.opengraph_image || seoData.rank_math_og_image || seoData.yoast_head_json?.og_image || "";
    if (Array.isArray(ogImage) && ogImage.length > 0) {
        ogImage = ogImage[0].url || ogImage[0];
    }
    
    if (ogImage && typeof ogImage === "string") {
        if (!ogImage.startsWith('http')) {
            ogImage = `${wpUrl}${ogImage}`;
        }
    } else {
        ogImage = "";
    }

    return {
        title,
        description,
        canonical,
        ogTitle: seoData.opengraph_title || seoData.rank_math_og_title || seoData.yoast_head_json?.og_title || title,
        ogDescription: seoData.opengraph_description || seoData.rank_math_og_description || seoData.yoast_head_json?.og_description || description,
        ogImage,
        ogType: seoData.opengraph_type || 'website'
    };
}

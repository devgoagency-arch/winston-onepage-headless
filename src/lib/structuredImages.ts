/**
 * Imágenes para datos estructurados (JSON-LD) y og:image.
 *
 * Google Merchant Center lee las fotos del producto desde el JSON-LD de la ficha: la primera es la
 * imagen principal y el resto son las adicionales. Estas funciones arman esa lista con la foto
 * destacada primero y siempre con el archivo de tamaño completo.
 */

// Cuando se edita una imagen en la biblioteca de medios de WordPress (por ejemplo, reducirla), el CMS
// deja esa copia como archivo "full" con un sufijo -e seguido de una marca de tiempo:
//   Amberley-III-Miel-Winstonandharry-1-e1752598594141.jpg   (1000x1000, la copia reducida)
//   Amberley-III-Miel-Winstonandharry-1.jpg                  (1500x1500, el original, misma carpeta)
// La copia reducida es la misma foto en menor tamaño; el original se conserva en el servidor.
const WP_EDIT_SUFFIX = /-e\d{8,}(\.(?:jpe?g|png|webp))$/i;

/** Devuelve la URL del archivo original sin el sufijo -e de WordPress (si lo tiene). */
export function fullSizeImageUrl(src: string): string {
    return String(src || '').replace(WP_EDIT_SUFFIX, '$1');
}

/**
 * Lista de URLs absolutas para el campo `image` del JSON-LD: destacada primero, sin repetidas y
 * con el archivo original cuando existe una copia reducida. Máximo 10, que es lo que Merchant Center
 * admite como imágenes adicionales más la principal.
 */
export function productSchemaImages(images: any[] | undefined | null, max = 10): string[] {
    const out: string[] = [];
    for (const img of images || []) {
        const raw = typeof img === 'string' ? img : img?.src;
        if (!raw || !/^https?:\/\//i.test(raw)) continue;
        const url = fullSizeImageUrl(raw);
        if (!out.includes(url)) out.push(url);
        if (out.length >= max) break;
    }
    return out;
}

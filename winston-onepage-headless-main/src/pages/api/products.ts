import type { APIRoute } from 'astro';

export const ALL: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const pageStr = url.searchParams.get('p') || url.searchParams.get('page') || '1';
    const page = parseInt(pageStr);
    const slug = url.searchParams.get('slug');

    try {
        // ... (resto del código del producto individual se mantiene)
        // 1. DETALLE DEL PRODUCTO
        if (slug) {
            const res = await fetch(`https://winstonandharrystore.com/wp-json/wc/store/v1/products?slug=${slug}`);
            if (!res.ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

            const data = await res.json();
            let product = data.find((p: any) => p && p.attributes && Array.isArray(p.attributes) && p.attributes.length > 0) || data[0];

            if (product && product.type === 'variable' && product.variations) {
                const colorAttr = product.attributes.find((a: any) => a.name.toLowerCase().includes('color'));
                if (colorAttr && colorAttr.terms) {
                    const variationImages: any = {};
                    const colors = colorAttr.terms.map((t: any) => t.slug);

                    await Promise.all(colors.map(async (colorSlug: string) => {
                        const variation = product.variations.find((v: any) =>
                            v.attributes && v.attributes.some((attr: any) => attr.value.toLowerCase() === colorSlug.toLowerCase())
                        );
                        if (variation) {
                            try {
                                const varRes = await fetch(`https://winstonandharrystore.com/wp-json/wc/store/v1/products/${variation.id}`);
                                if (varRes.ok) {
                                    const varData = await varRes.json();
                                    if (varData.images && varData.images.length > 0) {
                                        variationImages[colorSlug] = varData.images;
                                    }
                                }
                            } catch (e) { }
                        }
                    }));
                    product.variation_images_map = variationImages;
                }
            }

            // Optimizamos las imágenes del producto
            product = optimizeImages(product);

            return new Response(JSON.stringify(product), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
                }
            });
        }

        const wcResponse = await fetch(
            `https://winstonandharrystore.com/wp-json/wc/store/v1/products?category=63&per_page=100&orderby=date&order=desc`
        );

        if (!wcResponse.ok) return new Response(JSON.stringify({ error: 'API Error' }), { status: wcResponse.status });

        let allProducts = await wcResponse.json();

        // Para productos variables, obtener el mapa de imágenes de variaciones por color
        allProducts = await Promise.all(allProducts.map(async (product: any) => {
            if (product.type === 'variable' && product.variations && product.variations.length > 0) {
                const colorAttr = product.attributes?.find((a: any) => a.name.toLowerCase().includes('color'));
                if (colorAttr && colorAttr.terms) {
                    const variationImages: any = {};
                    const colors = colorAttr.terms.map((t: any) => t.slug);

                    await Promise.all(colors.map(async (colorSlug: string) => {
                        const normalizedColorSlug = colorSlug.toLowerCase().trim();
                        const variation = product.variations.find((v: any) =>
                            v.attributes && v.attributes.some((attr: any) =>
                                attr.value.toLowerCase().trim() === normalizedColorSlug
                            )
                        );
                        if (variation) {
                            try {
                                const varRes = await fetch(`https://winstonandharrystore.com/wp-json/wc/store/v1/products/${variation.id}`);
                                if (varRes.ok) {
                                    const varData = await varRes.json();
                                    if (varData.images && varData.images.length > 0) {
                                        variationImages[colorSlug] = varData.images;
                                    }
                                }
                            } catch (e) { }
                        }
                    }));
                    product.variation_images_map = variationImages;
                }
            }
            return product;
        }));

        // Optimizamos las imágenes de toda la lista
        allProducts = optimizeImages(allProducts);

        return new Response(JSON.stringify(allProducts), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};

/**
 * Función auxiliar para añadir .webp a las URLs de imágenes de WordPress de forma recursiva.
 */
function optimizeImages(data: any): any {
    if (!data) return data;

    if (Array.isArray(data)) {
        return data.map(item => optimizeImages(item));
    }

    if (typeof data === 'object') {
        const newData = { ...data };
        for (const key in newData) {
            if (key === 'src' && typeof newData[key] === 'string') {
                // Solo si es una URL de WordPress y no tiene ya .webp
                if (newData[key].includes('wp-content/uploads') && !newData[key].toLowerCase().endsWith('.webp')) {
                    // Limpieza de sufijos de edición de WordPress (-e1755...)
                    let cleanSrc = newData[key].replace(/-e\d+(?=\.(jpg|jpeg|png))/i, '');
                    newData[key] = `${cleanSrc}.webp`;
                }
            } else {
                newData[key] = optimizeImages(newData[key]);
            }
        }
        return newData;
    }

    return data;
}

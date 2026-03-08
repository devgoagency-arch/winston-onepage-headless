/**
 * WooCommerce REST API Client for Winston & Harry
 * Using ck/cs credentials for full access and better data processing.
 */

const CK = import.meta.env.WC_CONSUMER_KEY || "ck_28661c4aff0fc02b97a607862895fc40a187e867";
const CS = import.meta.env.WC_CONSUMER_SECRET || "cs_deb208f164b96724a90b64bf0f762a713251b7a2";
const BASE_URL = `${import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com"}/wp-json/wc/v3`;

const WP_APP_USER = import.meta.env.WP_APP_USER || "Astro Headless";
const WP_APP_PASS = import.meta.env.WP_APP_PASS || "fyWY ELGb lMsk XtlY y4Gy e18p";

// SSR Safe base64 helper
const safeBtoa = (str: string) => {
    try {
        if (typeof btoa !== 'undefined') return btoa(str);
        if (typeof (globalThis as any).Buffer !== 'undefined') {
            return (globalThis as any).Buffer.from(str).toString('base64');
        }
        return "";
    } catch (e) {
        console.error("safeBtoa error:", e);
        return "";
    }
};

const wpAppAuthHeader = `Basic ${safeBtoa(`${WP_APP_USER}:${WP_APP_PASS}`)}`;

// Sistema de Cache en Memoria (SSR & API)
const cache: Record<string, { data: any, timestamp: number }> = {};
const DEFAULT_TTL = 1000 * 60 * 5; // 5 minutos para ver cambios rápido

function getCached(key: string) {
    const entry = cache[key];
    if (entry && (Date.now() - entry.timestamp < DEFAULT_TTL)) {
        return entry.data;
    }
    return null;
}

function setCached(key: string, data: any) {
    cache[key] = { data, timestamp: Date.now() };
}

/**
 * Normaliza un texto para generar un slug válido (sin acentos, espacios -> guiones)
 */
function normalizeSlug(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/\s+/g, '-')           // Espacios a guiones
        .replace(/[^\w-]+/g, '');       // Quitar caracteres especiales
}

/**
 * Generic Fetcher with Basic Auth and Retry Logic
 */
async function wcFetch(path: string, options: RequestInit = {}, retries = 3, delay = 1500) {
    const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}consumer_key=${CK}&consumer_secret=${CS}`;

    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    'Accept': 'application/json',
                    ...(options.headers || {})
                }
            });

            // 404 (Not Found) - Throw immediately, no point in retrying
            if (res.status === 404) {
                throw new Error(`WC API Error: 404 Not Found`);
            }

            // 503 (Server Busy), 429 (Rate Limit), 500 (Internal Error) - Retry these
            if (res.status === 503 || res.status === 429 || res.status === 500 || res.status === 502) {
                if (i === retries - 1) {
                    throw new Error(`WC API Error: ${res.status} (After ${retries} attempts)`);
                }
                console.warn(`WC API Warning: ${res.status}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
                continue;
            }

            if (!res.ok) {
                throw new Error(`WC API Error: ${res.status} ${res.statusText}`);
            }

            return await res.json();
        } catch (error: any) {
            // Don't retry 404 caught in error block
            if (error.message.includes('404')) throw error;
            if (i === retries - 1) throw error;
            console.warn(`WC API Error: ${error.message}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
}

/**
 * Obtiene un pool de productos para recomendaciones con caché de 10 minutos
 * para evitar saturar el servidor en visitas masivas.
 */
export async function getProductsPool() {
    const cacheKey = 'products_pool_60';
    // Usamos un TTL de 10 minutos para este pool pesado
    const poolTTL = 1000 * 60 * 10;
    const entry = cache[cacheKey];
    if (entry && (Date.now() - entry.timestamp < poolTTL)) {
        return entry.data;
    }

    try {
        const products = await wcFetch('/products?per_page=60&orderby=date&status=publish&stock_status=instock');
        if (products) {
            cache[cacheKey] = { data: products, timestamp: Date.now() };
        }
        return products;
    } catch (error) {
        console.error("Error fetching products pool:", error);
        return [];
    }
}

/**
 * Maps wc/v3 structure to wc/store/v1 structure for frontend compatibility
 */
function mapV3ToStore(p: any) {
    if (!p) return null;

    // WooCommerce v3 doesn't return tax-inclusive price by default in some setups.
    // We detect if we need to add IVA (19% in Colombia usually) or use the display price.
    // Actually, Store API returns 825000 while v3 returns 693277.3109.
    // This confirms v3 is returning base price.
    // We will calculate the inclusive price for consistency with Store API which our frontend uses.
    const hasTax = p.tax_status === 'taxable';
    const rawPrice = parseFloat(p.price || "0");
    const inclusivePrice = hasTax ? Math.round(rawPrice * 1.19) : Math.round(rawPrice);

    const mapped = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        permalink: p.permalink,
        type: p.type,
        status: p.status,
        description: p.description,
        short_description: p.short_description,
        prices: {
            price: (inclusivePrice || 0).toString(),
            regular_price: p.regular_price
                ? Math.round(parseFloat(p.regular_price) * (hasTax ? 1.19 : 1)).toString()
                : (p.on_sale ? "" : (inclusivePrice || 0).toString()),
            sale_price: p.sale_price ? Math.round(parseFloat(p.sale_price) * (hasTax ? 1.19 : 1)).toString() : "",
            currency_code: "COP",
            currency_symbol: "$",
            currency_minor_unit: 0,
            currency_prefix: "$",
            price_range: null
        },
        images: p.images.map((img: any) => ({
            id: img.id,
            src: img.src,
            alt: img.alt || p.name,
            name: img.name
        })),
        attributes: p.attributes.map((attr: any) => ({
            id: attr.id,
            name: attr.name,
            slug: attr.slug,
            terms: attr.options.map((opt: string, idx: number) => ({
                id: idx,
                name: opt,
                slug: normalizeSlug(opt)
            }))
        })),
        categories: p.categories?.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug
        })) || [],
        category_ids: p.categories?.map((cat: any) => cat.id) || [],
        tags: p.tags?.map((t: any) => ({
            id: t.id,
            name: t.name,
            slug: t.slug
        })) || [],
        variation_ids: p.variations || [],
        on_sale: p.on_sale || false,
        featured: p.featured || false,
        upsell_ids: p.upsell_ids || [],
        cross_sell_ids: p.cross_sell_ids || [],
        variations: p.variations_data || null,
        variation_images_map: p.variation_images_map || null
    };

    // Para productos variables, si tenemos datos de variaciones, intentamos extraer los precios reales
    if (p.type === 'variable' && p.variations_data && p.variations_data.length > 0) {
        let maxRegular = 0;
        let minPrice = Infinity;

        p.variations_data.forEach((v: any) => {
            const vPrice = parseFloat(v.price || "0");
            const vRegular = parseFloat(v.regular_price || v.price || "0");
            if (vRegular > maxRegular) maxRegular = vRegular;
            if (vPrice > 0 && vPrice < minPrice) minPrice = vPrice;
        });

        if (maxRegular > 0) {
            mapped.prices.regular_price = Math.round(maxRegular * (hasTax ? 1.19 : 1)).toString();
        }
        if (minPrice !== Infinity) {
            mapped.prices.price = Math.round(minPrice * (hasTax ? 1.19 : 1)).toString();
        }
    }

    return mapped;
}

/**
 * Fetch Product by ID with all its variations
 */
export async function getProductById(id: number | string) {
    const cacheKey = `p_id_${id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const product = await wcFetch(`/products/${id}`);
        if (!product) return null;

        // Fetch Variations data if it's a variable product
        if (product.type === 'variable' && product.variations.length > 0) {
            const variations = await wcFetch(`/products/${product.id}/variations?per_page=100`);

            const variationImagesMap: Record<string, any[]> = {};
            variations.forEach((v: any) => {
                const colorAttr = v.attributes.find((a: any) =>
                    a.slug === 'pa_selecciona-el-color' ||
                    a.name.toLowerCase().includes('color')
                );

                if (colorAttr && v.image) {
                    const colorSlug = normalizeSlug(colorAttr.option);
                    variationImagesMap[colorSlug] = [{
                        id: v.image.id,
                        src: v.image.src,
                        alt: v.image.alt || colorAttr.option
                    }];
                }
            });

            product.variations_data = variations.map((v: any) => ({
                id: v.id,
                attributes: v.attributes.map((a: any) => ({
                    name: a.name,
                    value: normalizeSlug(a.option)
                })),
                price: v.price,
                regular_price: v.regular_price,
                sale_price: v.sale_price,
                stock_status: v.stock_status,
                image: v.image
            }));

            product.variation_images_map = variationImagesMap;
        }

        const result = mapV3ToStore(product);
        setCached(cacheKey, result);
        return result;
    } catch (error) {
        console.error(`Error fetching product by ID ${id}:`, error);
        return null;
    }
}

/**
 * Fetch Category by Slug
 */
export async function getCategoryBySlug(slug: string) {
    const cacheKey = `cat_slug_${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch(`/products/categories?slug=${slug}`);
        if (!categories || categories.length === 0) return null;

        setCached(cacheKey, categories[0]);
        return categories[0];
    } catch (error) {
        console.error(`Error fetching category by slug ${slug}:`, error);
        return null;
    }
}

/**
 * Fetch child categories of a parent category
 */
export async function getChildCategories(parentId: number) {
    const cacheKey = `cat_children_${parentId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch(`/products/categories?parent=${parentId}&per_page=50`);
        if (!categories) return [];

        setCached(cacheKey, categories);
        return categories;
    } catch (error) {
        console.error(`Error fetching child categories for parent ${parentId}:`, error);
        return [];
    }
}

/**
 * Fetch Product by Slug with all its variations in one go!
 */
export async function getProductBySlug(slug: string) {
    const cacheKey = `p_slug_${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const products = await wcFetch(`/products?slug=${slug}`);
        if (!products || products.length === 0) return null;

        const product = products[0];

        // Fetch Variations data if it's a variable product
        if (product.type === 'variable' && product.variations.length > 0) {
            // We can fetch all variations in one call!
            const variations = await wcFetch(`/products/${product.id}/variations?per_page=100`);

            // Map variations to a searchable map for the frontend
            const variationImagesMap: Record<string, any[]> = {};

            variations.forEach((v: any) => {
                // Find color attribute
                const colorAttr = v.attributes.find((a: any) =>
                    a.slug === 'pa_selecciona-el-color' ||
                    a.name.toLowerCase().includes('color')
                );

                if (colorAttr && v.image) {
                    const colorSlug = normalizeSlug(colorAttr.option);
                    // Store images for this color
                    variationImagesMap[colorSlug] = [{
                        id: v.image.id,
                        src: v.image.src,
                        alt: v.image.alt || colorAttr.option
                    }];
                }
            });

            product.variations_data = variations.map((v: any) => ({
                id: v.id,
                attributes: v.attributes.map((a: any) => ({
                    name: a.name,
                    value: normalizeSlug(a.option) // Normalize for frontend slug match
                })),
                price: v.price,
                regular_price: v.regular_price,
                sale_price: v.sale_price,
                stock_status: v.stock_status,
                image: v.image
            }));

            product.variation_images_map = variationImagesMap;
        }

        const result = mapV3ToStore(product);
        setCached(cacheKey, result);
        return result;
    } catch (error) {
        console.error("Error fetching product by slug:", error);
        throw error;
    }
}

export async function getProductsByCategory(
    categoryId: string | number,
    perPage = 100,
    page = 1,
    orderBy: any = 'date',
    order: any = 'desc',
    onSale = false,
    attribute?: string,
    attributeTerm?: string | number
) {
    const cacheKey = `cat_${categoryId}_${perPage}_${page}_${orderBy}_${order}_${onSale}_${attribute}_${attributeTerm}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const onSaleParam = onSale ? '&on_sale=true' : '';
        const attrParam = attribute ? `&attribute=${attribute}` : '';
        const termParam = attributeTerm ? `&attribute_term=${attributeTerm}` : '';

        const products = await wcFetch(
            `/products?category=${categoryId}&per_page=${perPage}&page=${page}&status=publish&stock_status=instock&orderby=${orderBy}&order=${order}${onSaleParam}${attrParam}${termParam}`
        );
        const result = products.map(mapV3ToStore);
        setCached(cacheKey, result);
        return result;
    } catch (error) {
        console.error("Error fetching products by category:", error);
        throw error;
    }
}
/**
 * Fetch a WordPress Page by ID
 */
export async function getPageById(id: number | string) {
    const cacheKey = `page_id_${id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        // En este caso usamos el endpoint nativo de WP para páginas, no el de WC
        // El dominio es el mismo: winstonandharrystore.com/wp-json/wp/v2/pages
        const wpBase = `${import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com"}/wp-json/wp/v2`;
        const res = await fetch(`${wpBase}/pages/${id}`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': wpAppAuthHeader
            }
        });

        if (!res.ok) {
            throw new Error(`WP API Error: ${res.status}`);
        }

        const page = await res.json();
        setCached(cacheKey, page);
        return page;
    } catch (error) {
        console.error(`Error fetching page by ID ${id}:`, error);
        return null;
    }
}

/**
 * Fetch a WordPress Menu by Slug
 */
export async function getMenu(slug: string) {
    const cacheKey = `menu_${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const wpBase = `${import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com"}/wp-json/wh/v1`;
        const res = await fetch(`${wpBase}/menu/${slug}`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': wpAppAuthHeader
            }
        });

        if (!res.ok) {
            throw new Error(`WP Menu API Error: ${res.status}`);
        }

        const menu = await res.json();
        setCached(cacheKey, menu);
        return menu;
    } catch (error) {
        console.error(`Error fetching menu ${slug}:`, error);
        return [];
    }
}

/**
 * Fetch WooCommerce Product Attributes
 */
export async function getAttributes() {
    const cacheKey = "wc_attributes";
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const attributes = await wcFetch("/products/attributes");
        setCached(cacheKey, attributes);
        return attributes;
    } catch (error) {
        console.error("Error fetching attributes:", error);
        return [];
    }
}

/**
 * Fetch WooCommerce Attribute Terms
 */
export async function getAttributeTerms(attributeId: number | string) {
    const cacheKey = `wc_attr_terms_${attributeId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const terms = await wcFetch(`/products/attributes/${attributeId}/terms?per_page=100`);
        setCached(cacheKey, terms);
        return terms;
    } catch (error) {
        console.error(`Error fetching terms for attribute ${attributeId}:`, error);
        return [];
    }
}

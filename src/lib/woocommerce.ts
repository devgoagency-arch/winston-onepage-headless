/**
 * WooCommerce REST API Client for Winston & Harry
 * Using ck/cs credentials for full access and better data processing.
 */

const WC_URL_ENV = import.meta.env.WC_URL || import.meta.env.WP_URL || "https://tienda.winstonandharrystore.com";
export const PUBLIC_WP_URL = WC_URL_ENV.replace(/\/$/, "");

const CK = import.meta.env.WC_CONSUMER_KEY;
const CS = import.meta.env.WC_CONSUMER_SECRET;

const BASE_URL = `${PUBLIC_WP_URL}/wp-json/wc/v3`;
const STORE_URL = `${PUBLIC_WP_URL}/wp-json/wc/store/v1`;

// Solo validamos las claves en el servidor
if (import.meta.env.SSR && (!CK || !CS)) {
    console.error("[WC API] CRÍTICO: Faltan WC_CONSUMER_KEY o WC_CONSUMER_SECRET en las variables de entorno.");
}


// SSR Safe base64 helper
const safeBtoa = (str: string) => {
    try {
        if (typeof (globalThis as any).Buffer !== 'undefined') {
            return (globalThis as any).Buffer.from(str).toString('base64');
        }
        if (typeof btoa !== 'undefined') return btoa(str);
        return "";
    } catch (e) {
        return "";
    }
};

const getAuthHeader = () => {
    if (!CK || !CS) return null;
    return `Basic ${safeBtoa(`${CK}:${CS}`)}`;
};

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
 * Robust JSON parsing helper
 */
function cleanJSON(jsonString: string) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        // Attempt to clean up common issues like unescaped newlines or control characters
        const cleanedString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/\\n/g, '\\n').replace(/\\r/g, '\\r').replace(/\\t/g, '\\t');
        try {
            return JSON.parse(cleanedString);
        } catch (e2) {
            console.error("Failed to parse JSON even after cleaning:", e2);
            return null;
        }
    }
}

/**
 * Generic Fetcher with Basic Auth and Retry Logic
 */
async function wcFetch(path: string, options: RequestInit = {}, retries = 3, delay = 1500) {
    // If it's a store API path, use PUBLIC_WP_URL + /wp-json/ and NO AUTH (Public)
    const isStore = path.includes('/wc/store/');
    const baseUrl = isStore ? `${PUBLIC_WP_URL}/wp-json` : BASE_URL;
    const authHeader = getAuthHeader();

    // Construct the URL
    const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    // Headers base
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        ...(options.headers as Record<string, string> || {})
    };

    // Solo añadimos Auth si no es el Store API (que es público)
    if (!isStore && authHeader) {
        headers['Authorization'] = authHeader;
    } else if (!isStore && !authHeader && import.meta.env.DEV) {
        console.warn("[WC API] No se añadió Auth Header para una ruta no-Store API porque no se pudo generar.");
    }


    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[WC API] Fetching: ${path} (Attempt ${i + 1}/${retries})${isStore ? ' [PUBLIC]' : ''}`);
            const startTime = Date.now();

            const res = await fetch(url, {
                ...options,
                headers
            });
            const endTime = Date.now();
            console.log(`[WC API] Response: ${res.status} (${endTime - startTime}ms)`);

            if (res.status === 404) throw new Error(`WC API Error: 404 Not Found`);
            if ([500, 502, 503, 429].includes(res.status)) {
                if (i === retries - 1) throw new Error(`WC API Error: ${res.status}`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
                continue;
            }

            if (!res.ok) {
                const errorBody = await res.text().catch(() => "No body");
                console.error(`[WC API] Error details: ${errorBody.substring(0, 200)}`);
                throw new Error(`WC API Error: ${res.status} ${res.statusText}`);
            }

            const text = await res.text();
            return cleanJSON(text);
        } catch (error: any) {
            if (error.message.includes('404')) throw error;
            if (i === retries - 1) {
                console.error(`[WC API] Final catch fail:`, error.message);
                throw error;
            }
            console.warn(`[WC API] Catch Error: ${error.message}. Retrying in ${delay}ms...`);
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
        // Use v3 API for reliable prices
        const products = await wcFetch('/products?per_page=60&orderby=date&status=publish&stock_status=instock');
        if (products && Array.isArray(products)) {
            const mapped = products.map((p: any) => mapV3ToStore(p));
            cache[cacheKey] = { data: mapped, timestamp: Date.now() };
            return mapped;
        }
        return [];
    } catch (error) {
        console.error("Error fetching products pool:", error);
        return [];
    }
}

/**
 * Maps wc/v3 structure to wc/store/v1 structure for frontend compatibility
 * If the input is already from Store API, it will pass through or be slightly adjusted.
 */
function mapV3ToStore(p: any) {
    if (!p) return null;

    // Detect if it's a Store API product (v1 or similar)
    const isStoreApi = !!(p.prices && p.prices.currency_code);

    if (isStoreApi) {
        // Ensure images is an array
        if (!p.images || !Array.isArray(p.images)) p.images = [];

        // The Store API returns prices in minor units (centavos).
        // currency_minor_unit tells us the exponent (e.g., 2 means divide by 100).
        // We normalize all prices to whole units and set currency_minor_unit to 0
        // so that ProductCard doesn't divide again.
        const minorUnit = p.prices?.currency_minor_unit || 0;
        const divisor = Math.pow(10, minorUnit);

        const normalizePriceStr = (val: string | undefined | null): string => {
            if (!val || val === "0") return "0";
            const num = Number(val);
            if (isNaN(num)) return "0";
            return Math.round(num / divisor).toString();
        };

        // If price is "0", try price_range first
        let rawPrice = p.prices.price;
        if ((!rawPrice || rawPrice === "0") && p.prices.price_range) {
            const min = p.prices.price_range.min_amount;
            if (min && min !== "0") rawPrice = min;
        }

        // Fallback to regular_price
        if (!rawPrice || rawPrice === "0") {
            rawPrice = p.prices.regular_price;
        }

        p.prices.price = normalizePriceStr(rawPrice);
        p.prices.regular_price = normalizePriceStr(p.prices.regular_price);
        p.prices.sale_price = normalizePriceStr(p.prices.sale_price);
        p.prices.currency_minor_unit = 0; // Already normalized

        return p;
    }

    // Fallback for WooCommerce standard API (v3)
    const hasTax = p.tax_status === 'taxable';
    let rawPrice = parseFloat(p.price || p.regular_price || "0");

    // If still 0, check variations if available
    if (rawPrice === 0 && p.variations_data && p.variations_data.length > 0) {
        const prices = p.variations_data.map((v: any) => parseFloat(v.price || "0")).filter((pr: number) => pr > 0);
        if (prices.length > 0) rawPrice = Math.min(...prices);
    }

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
        images: (p.images || []).map((img: any) => ({
            id: img.id || 0,
            src: img.src || 'https://via.placeholder.com/600x600?text=Sin+Imagen',
            alt: img.alt || p.name,
            name: img.name || ""
        })),
        attributes: (p.attributes || []).map((attr: any) => ({
            id: attr.id,
            name: attr.name,
            slug: attr.slug,
            terms: attr.options?.map((opt: string, idx: number) => ({
                id: idx,
                name: opt,
                slug: normalizeSlug(opt)
            })) || []
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
        // Use v3 API instead of Store API to get correct variable product prices
        const product = await wcFetch(`/products/${id}`);
        if (!product) return null;

        // For variable products, fetch variations to get real prices + images
        if (product.type === 'variable' && product.id) {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;

            // Build variation_images_map by color
            if (variations.length > 0) {
                const imgMap: Record<string, any[]> = {};
                variations.forEach((v: any) => {
                    const colorAttr = v.attributes?.find((a: any) =>
                        a.name.toLowerCase().includes('color') || a.slug?.includes('color')
                    );
                    if (colorAttr?.option && v.image?.src) {
                        const colorKey = colorAttr.option.toLowerCase().trim();
                        if (!imgMap[colorKey]) imgMap[colorKey] = [];
                        imgMap[colorKey].push({ src: v.image.src, alt: v.image.alt || '' });
                    }
                });
                product.variation_images_map = imgMap;
            }
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
        // Use WooCommerce API to get category data including its image
        const categories = await wcFetch(`/products/categories?slug=${slug}`);
        if (!categories || categories.length === 0) return null;

        setCached(cacheKey, categories[0]);
        return categories[0];
    } catch (error: any) {
        console.error(`Error fetching category by slug ${slug}:`, error.message);
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
        // Use v3 authenticated API — public Store API was not returning subcategories reliably
        const categories = await wcFetch(`/products/categories?parent=${parentId}&per_page=50`);
        if (!categories || !Array.isArray(categories)) return [];

        // Normalize: map v3 fields to the shape the components expect (name, slug, id, image)
        const normalized = categories.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            count: c.count,
            image: c.image ? { src: c.image.src, alt: c.image.alt || c.name } : null,
        }));

        setCached(cacheKey, normalized);
        return normalized;
    } catch (error) {
        console.error(`Error fetching child categories for parent ${parentId}:`, error);
        return [];
    }
}

/**
 * Fetch Product by Slug with all its variations in one go!
 */
/**
 * Fetch variations for a variable product (v3 API, authenticated)
 */
async function getProductVariations(productId: number) {
    try {
        const vars = await wcFetch(`/products/${productId}/variations?per_page=100`);
        return Array.isArray(vars) ? vars : [];
    } catch (e) {
        return [];
    }
}

export async function getProductBySlug(slug: string) {
    const cacheKey = `p_slug_${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        // Use v3 API (authenticated) to get correct price data
        const products = await wcFetch(`/products?slug=${slug}&status=publish&stock_status=instock`);
        if (!products || products.length === 0) return null;

        const product = products[0];

        // For variable products, fetch variations to get real prices + images
        if (product.type === 'variable' && product.id) {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;

            // Build variation_images_map by color
            if (variations.length > 0) {
                const imgMap: Record<string, any[]> = {};
                variations.forEach((v: any) => {
                    const colorAttr = v.attributes?.find((a: any) =>
                        a.name.toLowerCase().includes('color') || a.slug?.includes('color')
                    );
                    if (colorAttr?.option && v.image?.src) {
                        const colorKey = colorAttr.option.toLowerCase().trim();
                        if (!imgMap[colorKey]) imgMap[colorKey] = [];
                        imgMap[colorKey].push({ src: v.image.src, alt: v.image.alt || '' });
                    }
                });
                product.variation_images_map = imgMap;
            }
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
        const ids = categoryId.toString().split(',').map(id => id.trim()).filter(Boolean);

        const fetchCategory = async (id: string) => {
            try {
                // Use authenticated v3 API — the public Store API returns price:"0" for variable products
                const data = await wcFetch(`/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}&status=publish&stock_status=instock${onSale ? '&on_sale=true' : ''}${attribute ? `&attribute=${attribute}` : ''}${attributeTerm ? `&attribute_term=${attributeTerm}` : ''}`);
                return Array.isArray(data) ? data : [];
            } catch (err: any) {
                console.error(`[getProductsByCategory] v3 cat ${id} failed:`, err.message);
                return [];
            }
        };

        const results = await Promise.all(ids.map(fetchCategory));

        const combined = [];
        const seenIds = new Set();
        for (const list of results) {
            if (Array.isArray(list)) {
                for (const p of list) {
                    if (p && p.id && !seenIds.has(p.id)) {
                        seenIds.add(p.id);
                        combined.push(mapV3ToStore(p));
                    }
                }
            }
        }

        setCached(cacheKey, combined);
        return combined;
    } catch (error: any) {
        console.error("Error fetching products by category:", error.message);
        return [];
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
        const wpBase = `${PUBLIC_WP_URL}/wp-json/wp/v2`;
        const res = await fetch(`${wpBase}/pages/${id}`, {
            headers: {
                'Accept': 'application/json'
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
        const wpBase = `${PUBLIC_WP_URL}/wp-json/wh/v1`;
        const res = await fetch(`${wpBase}/menu/${slug}`, {
            headers: {
                'Accept': 'application/json'
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

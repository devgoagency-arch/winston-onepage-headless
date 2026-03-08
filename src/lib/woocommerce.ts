/**
 * WooCommerce REST API Client for Winston & Harry
 * Using ck/cs credentials for full access and better data processing.
 */

const CK = import.meta.env.WC_CONSUMER_KEY || "ck_28661c4aff0fc02b97a607862895fc40a187e867";
const CS = import.meta.env.WC_CONSUMER_SECRET || "cs_deb208f164b96724a90b64bf0f762a713251b7a2";
const WP_BASE = (import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com").replace(/\/$/, "");
const BASE_URL = `${WP_BASE}/wp-json/wc/v3`;
const STORE_URL = `${WP_BASE}/wp-json/wc/store/v1`;


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

const wcAuthHeader = `Basic ${safeBtoa(`${CK}:${CS}`)}`;

console.log(`[WC Auth] Header generated (length: ${wcAuthHeader.length})`);

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
    // If it's a store API path, use WP_BASE + /wp-json/ and NO AUTH (Public)
    const isStore = path.includes('/wc/store/');
    const baseUrl = isStore ? `${WP_BASE}/wp-json` : BASE_URL;

    // Construct the URL
    // If it's NOT store, we add CK/CS. If it already has ?, we use &.
    const url = isStore
        ? `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
        : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}${path.includes('?') ? '&' : '?'}consumer_key=${CK}&consumer_secret=${CS}`;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[WC API] Fetching: ${path} (Attempt ${i + 1}/${retries})${isStore ? ' [PUBLIC]' : ''}`);
            const startTime = Date.now();

            const res = await fetch(url, {
                ...options,
                headers: {
                    'Accept': 'application/json',
                    ...(options.headers || {})
                }
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
        // Use Store API for public product listing
        const products = await wcFetch('/wc/store/v1/products?per_page=60&orderby=date&status=publish&stock_status=instock');
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
 * If the input is already from Store API, it will pass through or be slightly adjusted.
 */
function mapV3ToStore(p: any) {
    if (!p) return null;

    // Detect if it's a Store API product (v1 or similar)
    const isStoreApi = !!(p.prices && p.prices.currency_code);

    if (isStoreApi) {
        // Ensure images is an array
        if (!p.images || !Array.isArray(p.images)) p.images = [];

        // If price is "0", try to find a better one in price_range or other fields
        if ((!p.prices.price || p.prices.price === "0") && p.prices.price_range) {
            const min = p.prices.price_range.min_amount;
            if (min && min !== "0") p.prices.price = min;
        }

        // Final fallback: if still "0", use regular_price
        if ((!p.prices.price || p.prices.price === "0") && p.prices.regular_price && p.prices.regular_price !== "0") {
            p.prices.price = p.prices.regular_price;
        }

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
        // Prioritize Store API for public product data
        const product = await wcFetch(`/wc/store/v1/products/${id}`);
        if (!product) return null;

        // Store API usually includes variations data directly or in a more processed format.
        // If it's a variable product, ensure variations are properly mapped.
        // The Store API response for a single product often includes `variations` as an array of IDs,
        // and `_links.variations` for fetching them.
        // However, for simplicity and consistency with the frontend, we'll assume `mapV3ToStore`
        // can handle the Store API format directly or that the Store API provides enough.
        // If specific variation details (like images per color) are needed,
        // we might still need to fetch them separately if not fully embedded.

        // The Store API product object should already be in a suitable format,
        // so mapV3ToStore will mostly act as a passthrough or minor adjustment.
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
        // Use public WordPress Taxonomy API (product_cat)
        const res = await fetch(`${WP_BASE}/wp-json/wp/v2/product_cat?slug=${slug}`);
        if (!res.ok) throw new Error(`WP Category Error: ${res.status}`);

        const categories = await res.json();
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
        // Use Store API for public category listing
        const categories = await wcFetch(`/wc/store/v1/products/categories?parent=${parentId}&per_page=50`);
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
        // Prioritize Store API for public product data
        const products = await wcFetch(`/wc/store/v1/products?slug=${slug}`);
        if (!products || products.length === 0) return null;

        const product = products[0];

        // The Store API product object should already be in a suitable format,
        // so mapV3ToStore will mostly act as a passthrough or minor adjustment.
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
                // Use Public Store API for products list
                const data = await wcFetch(`/wc/store/v1/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}${onSale ? '&on_sale=true' : ''}${attribute ? `&attribute=${attribute}` : ''}${attributeTerm ? `&attribute_term=${attributeTerm}` : ''}`);
                return Array.isArray(data) ? data : [];
            } catch (err: any) {
                console.error(`[getProductsByCategory] Public cat ${id} failed:`, err.message);
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
                        combined.push(mapV3ToStore(p)); // Already formatted correctly usually by Store API
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
        const wpBase = `${import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com"}/wp-json/wp/v2`;
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
        const wpBase = `${import.meta.env.WC_URL || "https://tienda.winstonandharrystore.com"}/wp-json/wh/v1`;
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

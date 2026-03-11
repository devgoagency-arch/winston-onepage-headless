/**
 * WooCommerce REST API Client for Winston & Harry
 * Using ck/cs credentials for full access and better data processing.
 */

let WC_URL_ENV = import.meta.env.WC_URL || import.meta.env.WP_URL || "https://tienda.winstonandharrystore.com";

// CORRECCIÓN DE EMERGENCIA: Si el dominio no tiene "tienda.", se lo ponemos a la fuerza
if (WC_URL_ENV.includes("winstonandharrystore.com") && !WC_URL_ENV.includes("tienda.")) {
    WC_URL_ENV = WC_URL_ENV.replace("winstonandharrystore.com", "tienda.winstonandharrystore.com");
}

export const PUBLIC_WP_URL = WC_URL_ENV.replace(/\/$/, "");
const WP_JSON_BASE = `${PUBLIC_WP_URL}/wp-json`;

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

/**
 * Configuración de Caché (Nivel 2 - On Demand ISR)
 */
export const CACHE_TAGS = {
    all: 'products-all',
    product: (slug: string) => `product-${slug}`,
    category: (slug: string) => `category-${slug}`,
    home: 'home'
};

// ─── CACHÉ ESTÁTICA (Menús, Atributos, Categorías) ─────────────────────────
// TTL de 5 minutos para evitar saturar WC en ráfagas de tráfico
const STATIC_CACHE: Record<string, { data: any, timestamp: number }> = {};
const STATIC_TTL = 1000 * 60 * 5;

function getStaticCached(key: string) {
    const entry = STATIC_CACHE[key];
    if (entry && (Date.now() - entry.timestamp < STATIC_TTL)) return entry.data;
    return null;
}

function setStaticCached(key: string, data: any) {
    if (data) STATIC_CACHE[key] = { data, timestamp: Date.now() };
}
// ───────────────────────────────────────────────────────────────────────────

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

export async function wcFetch(path: string, options: RequestInit = {}, retries = 3, delay = 1500) {
    // Leemos las claves en RUNTIME
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || "").trim();
    const CS = (import.meta.env.WC_CONSUMER_SECRET || import.meta.env.WP_CONSUMER_SECRET || "").trim();

    if (import.meta.env.SSR) {
        if (!CK.startsWith('ck_')) console.error(`[WC API] ALERTA: La Key no empieza por 'ck_' (actual: ${CK.substring(0, 4)}...)`);
        if (!CS.startsWith('cs_')) console.error(`[WC API] ALERTA: El Secret no empieza por 'cs_' (actual: ${CS.substring(0, 4)}...)`);
    }

    if (!CK || !CS) {
        console.error("[WC API] ERROR: Claves no encontradas en el request.");
    }
    // 1. Normalizar el path: quitar barras iniciales y el texto 'wp-json/' si viene incluido
    let cleanPath = path.replace(/^\/+/, '').replace('wp-json/', '');
    
    // 2. Determinar la URL final con el Namespace correcto
    let url = "";
    if (path.startsWith('http')) {
        url = path;
    } else {
        const namespaces = ['wc/', 'wp/', 'wh/'];
        const hasNamespace = namespaces.some(ns => cleanPath.startsWith(ns));
        
        if (hasNamespace) {
            // Ya tiene namespace (ej: wh/v1/menu)
            url = `${PUBLIC_WP_URL}/wp-json/${cleanPath}`;
        } else {
            // Es una ruta de WooCommerce puro (ej: products), añadimos wc/v3/
            url = `${PUBLIC_WP_URL}/wp-json/wc/v3/${cleanPath}`;
        }
    }

    // Limpieza de dobles barras (excepto las de http://)
    url = url.replace(/([^:]\/)\/+/g, "$1");

    // 3. Añadir Auth solo si NO es Store API (que es público)
    const isStore = cleanPath.includes('wc/store/');
    
    // 4. Headers base
    const headers: any = {
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    if (!isStore && CK && CS) {
        // Probamos ambos métodos por seguridad: Header y Query Params
        if (url.includes('?')) {
            url += `&consumer_key=${CK}&consumer_secret=${CS}`;
        } else {
            url += `?consumer_key=${CK}&consumer_secret=${CS}`;
        }
        // También mantenemos el header por si el servidor lo prefiere
        headers['Authorization'] = `Basic ${safeBtoa(`${CK}:${CS}`)}`;
    }

    for (let i = 0; i < retries; i++) {
        try {
            const startTime = Date.now();
            const res = await fetch(url, { ...options, headers });
            const endTime = Date.now();
            
            console.log(`[WC API] ${res.status} | ${url.split('?')[0]} (${endTime - startTime}ms)`);

            if (res.status === 401) {
                console.error(`[WC API] 401 Unauthorized en ${url.split('?')[0]}. Revisa las claves WC_CONSUMER_KEY/SECRET.`);
                // No lanzamos error fatal aquí para permitir que la app siga si hay caché
                return null;
            }
            
            if (res.status === 404) throw new Error(`WC API 404 en: ${url.split('?')[0]}`);
            
            if (!res.ok) {
                if ([500, 502, 503, 429].includes(res.status) && i < retries - 1) {
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }
                throw new Error(`WC API Error: ${res.status}`);
            }

            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                const cleaned = text.substring(text.indexOf('{'));
                return JSON.parse(cleaned);
            }
        } catch (error: any) {
            if (i === retries - 1) throw error;
            console.warn(`[WC API] Intento ${i+1} fallido: ${error.message}`);
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
    try {
        // Usamos la Store API para obtener variaciones y precios formateados sin necesidad de auth
        const url = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?per_page=60&stock_status=instock`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Store API error: ${res.status}`);
        
        const products = await res.json();
        if (products && Array.isArray(products)) {
            return products
                .map((p: any) => mapV3ToStore(p))
                .filter(p => p && p.prices.price !== "0" && p.stock_status !== 'outofstock');
        }
        return [];
    } catch (error) {
        console.error("Error fetching products pool via Store API:", error);
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

        // Normalize stock status only if coming from Store API raw
        if (p.is_in_stock !== undefined) {
            p.stock_status = p.is_in_stock ? 'instock' : 'outofstock';
        } else if (!p.stock_status) {
            p.stock_status = 'instock';
        }

        // The Store API returns prices in minor units (centavos).
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

        if (!rawPrice || rawPrice === "0") {
            rawPrice = p.prices.regular_price;
        }

        p.prices.price = normalizePriceStr(rawPrice);
        p.prices.regular_price = normalizePriceStr(p.prices.regular_price);
        p.prices.sale_price = normalizePriceStr(p.prices.sale_price);
        p.prices.currency_minor_unit = 0; // Already normalized

        // Deep mapping for variations if they exist in Store API
        if (p.variations && Array.isArray(p.variations)) {
            p.variations = p.variations.map((v: any) => ({
                ...v,
                stock_status: v.is_in_stock !== undefined 
                    ? (v.is_in_stock ? 'instock' : 'outofstock') 
                    : (v.stock_status || 'instock'),
                attributes: (v.attributes || []).map((a: any) => ({
                    ...a,
                    option: a.value || a.option || '',
                    value: a.value || a.option || ''
                }))
            }));
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
        variations: p.variations_data?.map((v: any) => ({
            ...v,
            stock_status: v.stock_status || 'instock',
            // Normalizamos los atributos para que siempre tengan 'option' Y 'value'
            // WC v3 usa 'option', Store API usa 'value'. Esto permite búsqueda flexible.
            attributes: (v.attributes || []).map((a: any) => ({
                ...a,
                // Aseguramos que ambos campos estén disponibles
                option: a.option || a.value || '',
                value: a.value || a.option || '',
            }))
        })) || null,
        variation_images_map: p.variation_images_map || null,
        stock_status: p.stock_status || 'instock',
        manage_stock: p.manage_stock || false,
        stock_quantity: p.stock_quantity || null
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
        return result;
    } catch (error) {
        console.error(`Error fetching product by ID ${id}:`, error);
        return null;
    }
}

export async function getCategoryBySlug(slug: string) {
    const cacheKey = `cat_slug_${slug}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch(`/products/categories?slug=${slug}`);
        if (!categories || categories.length === 0) return null;
        
        const result = categories[0];
        setStaticCached(cacheKey, result);
        return result;
    } catch (error: any) {
        console.error(`Error fetching category by slug ${slug}:`, error.message);
        return null;
    }
}

/**
 * Fetch child categories of a parent category
 */
export async function getChildCategories(parentId: number) {

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

    try {
        console.log(`[WC API] Fetching product by slug: ${slug}`);
        
        // 1. Intento vía Public WP API (para obtener el ID desde el slug sin auth)
        let productId = null;
        try {
            const wpRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/product?slug=${slug}`);
            if (wpRes.ok) {
                const wpData = await wpRes.json();
                if (Array.isArray(wpData) && wpData.length > 0) {
                    productId = wpData[0].id;
                }
            }
        } catch (e) {
            console.warn(`[WC API] WP API lookup failed for slug ${slug}, falling back.`);
        }

        // 2. Si tenemos ID, usamos Store API (pública y completa con variaciones)
        if (productId) {
            try {
                const storeRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/store/v1/products/${productId}`);
                if (storeRes.ok) {
                    const storeProduct = await storeRes.json();
                    const result = mapV3ToStore(storeProduct);
                            return result;
                }
            } catch (e) {
                console.warn(`[WC API] Store API fetch failed for ID ${productId}, falling back to v3.`);
            }
        }

        // 3. Fallback final: REST API v3 (con Auth)
        const path = `/products?slug=${slug}&status=publish`;
        const products = await wcFetch(path);
        
        if (!products || products.length === 0) {
            console.warn(`[WC API] No products found for slug: ${slug} in all APIs.`);
            return null;
        }

        const product = products[0];
        if (product.type === 'variable' && product.id) {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;
            
            if (variations.length > 0) {
                const imgMap: Record<string, any[]> = {};
                variations.forEach((v: any) => {
                    const colorAttr = v.attributes?.find((a: any) =>
                        (a.name || "").toLowerCase().includes('color') || a.id === 'pa_color'
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
        return result;
    } catch (error: any) {
        console.error(`[WC API] Error crítico en getProductBySlug "${slug}":`, error.message);
        return null;
    }
}

export async function getProductsByCategory(
    categoryIdOrSlug: string | number,
    perPage = 100,
    page = 1,
    orderBy: any = 'date',
    order: any = 'desc',
    onSale = false,
    attribute?: string,
    attributeTerm?: string | number
) {
    let finalId = categoryIdOrSlug;

    // Si recibimos un slug (ej: "zapatos") en lugar de un ID numérico
    if (typeof categoryIdOrSlug === 'string' && isNaN(Number(categoryIdOrSlug))) {
        try {
            const cat = await getCategoryBySlug(categoryIdOrSlug);
            if (cat) finalId = cat.id;
        } catch (e) {
            console.error(`[getProductsByCategory] No se pudo encontrar ID para el slug: ${categoryIdOrSlug}`);
        }
    }


    try {
        const ids = finalId.toString().split(',').map(id => id.trim()).filter(Boolean);

        const fetchCategory = async (id: string) => {
            try {
                // PRIORIDAD: Store API (Pública, mucho más rápida y cacheable en el server de WP)
                const storeUrl = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}${onSale ? '&on_sale=true' : ''}`;
                const storeRes = await fetch(storeUrl);
                
                if (storeRes.ok) {
                    const data = await storeRes.json();
                    return Array.isArray(data) ? data : [];
                }
                
                // Fallback: Si Store API falla, usamos v3 (Autenticada)
                const data = await wcFetch(`/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}&status=publish${onSale ? '&on_sale=true' : ''}${attribute ? `&attribute=${attribute}` : ''}${attributeTerm ? `&attribute_term=${attributeTerm}` : ''}`);
                return Array.isArray(data) ? data : [];
            } catch (err: any) {
                console.warn(`[getProductsByCategory] Error en fetch para id ${id}:`, err.message);
                return [];
            }
        };

        const results = await Promise.all(ids.map(fetchCategory));

        const combined = [];
        const seenIds = new Set();
        for (const list of results) {
            if (Array.isArray(list)) {
                for (const p of list) {
                    if (p && (p.id || p.id === 0) && !seenIds.has(p.id)) {
                        const mapped = mapV3ToStore(p);
                        if (mapped) {
                            seenIds.add(p.id);
                            combined.push(mapped);
                        }
                    }
                }
            }
        }

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
    try {
        const page = await wcFetch(`/wp/v2/pages/${id}`);
        return page;
    } catch (error) {
        console.error(`Error fetching page by ID ${id}:`, error);
        return null;
    }
}

/**
 * Menús y Atributos: Caché de 5 min (Datos casi estáticos)
 */
export async function getMenu(slug: string) {
    const cacheKey = `menu_${slug}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const menu = await wcFetch(`/wh/v1/menu/${slug}`);
        setStaticCached(cacheKey, menu);
        return menu;
    } catch (error) {
        console.error(`Error fetching menu ${slug}:`, error);
        return [];
    }
}

export async function getAttributes() {
    const cacheKey = "wc_attributes";
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const attributes = await wcFetch("/products/attributes");
        setStaticCached(cacheKey, attributes);
        return attributes;
    } catch (error) {
        console.error("Error fetching attributes:", error);
        return [];
    }
}

export async function getAttributeTerms(attributeId: number | string) {
    const cacheKey = `wc_attr_terms_${attributeId}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const terms = await wcFetch(`/products/attributes/${attributeId}/terms?per_page=100`);
        setStaticCached(cacheKey, terms);
        return terms;
    } catch (error) {
        console.error(`Error fetching terms for attribute ${attributeId}:`, error);
        return [];
    }
}

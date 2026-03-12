/**
 * WooCommerce REST API Client for Winston & Harry
 *
 * CACHE STRATEGY (Niveles 1, 2 y 3):
 * - ISR 24h en páginas (Vercel Edge Cache)
 * - Cache Tags para invalidación on-demand por producto/categoría (Nivel 2)
 * - Sin caché en memoria: es inútil en serverless (cada request = nueva función)
 * - Warm-cache corre a las 5AM vía cron (Nivel 3)
 */

let WC_URL_ENV = import.meta.env.WC_URL || import.meta.env.WP_URL || "https://tienda.winstonandharrystore.com";

if (WC_URL_ENV.includes("winstonandharrystore.com") && !WC_URL_ENV.includes("tienda.")) {
    WC_URL_ENV = WC_URL_ENV.replace("winstonandharrystore.com", "tienda.winstonandharrystore.com");
}

export const PUBLIC_WP_URL = WC_URL_ENV.replace(/\/$/, "");

// ─── CACHE TAGS ──────────────────────────────────────────────────────────────
// Cada página declara sus tags en el frontmatter con export const revalidate
// El webhook llama a revalidateTag() con el tag exacto para invalidar solo esa página
export const CACHE_TAGS = {
    allProducts: 'products-all',
    product:     (slug: string) => `product-${slug}`,
    category:    (slug: string) => `category-${slug}`,
    menu:        'menu',
    home:        'home',
};

function normalizeSlug(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '');
}

async function wcFetch(path: string, options: RequestInit = {}, retries = 3, delay = 1500) {
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || "").trim();
    const CS = (import.meta.env.WC_CONSUMER_SECRET || import.meta.env.WP_CONSUMER_SECRET || "").trim();

    if (import.meta.env.SSR) {
        if (CK && !CK.startsWith('ck_')) console.error(`[WC API] ALERTA: La Key no empieza por 'ck_' (actual: ${CK.substring(0, 4)}...)`);
        if (CS && !CS.startsWith('cs_')) console.error(`[WC API] ALERTA: El Secret no empieza por 'cs_' (actual: ${CS.substring(0, 4)}...)`);
    }

    let cleanPath = path.replace(/^\/+/, '').replace('wp-json/', '');
    let url = "";

    if (path.startsWith('http')) {
        url = path;
    } else {
        const namespaces = ['wc/', 'wp/', 'wh/'];
        const hasNamespace = namespaces.some(ns => cleanPath.startsWith(ns));
        url = hasNamespace
            ? `${PUBLIC_WP_URL}/wp-json/${cleanPath}`
            : `${PUBLIC_WP_URL}/wp-json/wc/v3/${cleanPath}`;
    }

    url = url.replace(/([^:]\/)\/+/g, "$1");

    const finalCleanPath = url.split('wp-json/')[1] || "";
    const isWcNamespace = finalCleanPath.startsWith('wc/');
    const isStore = finalCleanPath.includes('wc/store/');
    const needsAuth = isWcNamespace && !isStore;

    if (needsAuth && CK && CS) {
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}consumer_key=${CK}&consumer_secret=${CS}`;
    }

    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };

    for (let i = 0; i < retries; i++) {
        try {
            const t0 = Date.now();
            const res = await fetch(url, { ...options, headers });
            console.log(`[WC API] ${res.status} | ${url.split('?')[0]} (${Date.now() - t0}ms)`);

            if (res.status === 401) throw new Error(`WC API 401: ${(await res.text()).substring(0, 100)}`);
            if (res.status === 404) throw new Error(`WC API 404: ${url.split('?')[0]}`);

            if (!res.ok) {
                if ([500, 502, 503, 429].includes(res.status) && i < retries - 1) {
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }
                throw new Error(`WC API Error: ${res.status}`);
            }

            const text = await res.text();
            try { return JSON.parse(text); }
            catch { return JSON.parse(text.substring(text.indexOf('{'))); }
        } catch (error: any) {
            if (i === retries - 1) throw error;
            console.warn(`[WC API] Intento ${i + 1} fallido: ${error.message}`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
}

// ─── MAP V3 → STORE ──────────────────────────────────────────────────────────
function mapV3ToStore(p: any) {
    if (!p) return null;

    const isStoreApi = !!(p.prices && p.prices.currency_code);
    if (isStoreApi) {
        if (!p.images || !Array.isArray(p.images)) p.images = [];
        const minorUnit = p.prices?.currency_minor_unit || 0;
        const divisor = Math.pow(10, minorUnit);
        const norm = (val: string | undefined | null): string => {
            if (!val || val === "0") return "0";
            const num = Number(val);
            return isNaN(num) ? "0" : Math.round(num / divisor).toString();
        };
        let rawPrice = p.prices.price;
        if ((!rawPrice || rawPrice === "0") && p.prices.price_range?.min_amount) rawPrice = p.prices.price_range.min_amount;
        if (!rawPrice || rawPrice === "0") rawPrice = p.prices.regular_price;
        p.prices.price = norm(rawPrice);
        p.prices.regular_price = norm(p.prices.regular_price);
        p.prices.sale_price = norm(p.prices.sale_price);
        p.prices.currency_minor_unit = 0;
        return p;
    }

    const hasTax = p.tax_status === 'taxable';
    let rawPrice = parseFloat(p.price || p.regular_price || "0");
    if (rawPrice === 0 && p.variations_data?.length > 0) {
        const prices = p.variations_data.map((v: any) => parseFloat(v.price || "0")).filter((pr: number) => pr > 0);
        if (prices.length > 0) rawPrice = Math.min(...prices);
    }
    const toPrice = (n: number) => hasTax ? Math.round(n * 1.19) : Math.round(n);
    const inclusivePrice = toPrice(rawPrice);

    const mapped: any = {
        id: p.id, name: p.name, slug: p.slug, permalink: p.permalink,
        type: p.type, status: p.status, description: p.description,
        short_description: p.short_description,
        prices: {
            price: (inclusivePrice || 0).toString(),
            regular_price: p.regular_price ? toPrice(parseFloat(p.regular_price)).toString() : (p.on_sale ? "" : (inclusivePrice || 0).toString()),
            sale_price: p.sale_price ? toPrice(parseFloat(p.sale_price)).toString() : "",
            currency_code: "COP", currency_symbol: "$", currency_minor_unit: 0,
            currency_prefix: "$", price_range: null
        },
        images: (p.images || []).map((img: any) => ({
            id: img.id || 0,
            src: img.src || 'https://via.placeholder.com/600x600?text=Sin+Imagen',
            alt: img.alt || p.name, name: img.name || ""
        })),
        attributes: (p.attributes || []).map((attr: any) => ({
            id: attr.id, name: attr.name, slug: attr.slug,
            terms: attr.options?.map((opt: string, idx: number) => ({ id: idx, name: opt, slug: normalizeSlug(opt) })) || []
        })),
        categories: p.categories?.map((cat: any) => ({ id: cat.id, name: cat.name, slug: cat.slug })) || [],
        category_ids: p.categories?.map((cat: any) => cat.id) || [],
        tags: p.tags?.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug })) || [],
        variation_ids: p.variations || [],
        on_sale: p.on_sale || false, featured: p.featured || false,
        upsell_ids: p.upsell_ids || [], cross_sell_ids: p.cross_sell_ids || [],
        variations: p.variations_data || null, variation_images_map: p.variation_images_map || null
    };

    if (p.type === 'variable' && p.variations_data?.length > 0) {
        let maxRegular = 0, minPrice = Infinity;
        p.variations_data.forEach((v: any) => {
            const vPrice = parseFloat(v.price || "0");
            const vRegular = parseFloat(v.regular_price || v.price || "0");
            if (vRegular > maxRegular) maxRegular = vRegular;
            if (vPrice > 0 && vPrice < minPrice) minPrice = vPrice;
        });
        if (maxRegular > 0) mapped.prices.regular_price = toPrice(maxRegular).toString();
        if (minPrice !== Infinity) mapped.prices.price = toPrice(minPrice).toString();
    }
    return mapped;
}

// ─── HELPERS DE VARIACIONES ──────────────────────────────────────────────────
async function getProductVariations(productId: number) {
    try {
        const vars = await wcFetch(`/products/${productId}/variations?per_page=100`);
        return Array.isArray(vars) ? vars : [];
    } catch { return []; }
}

function buildVariationImagesMap(variations: any[]) {
    const imgMap: Record<string, any[]> = {};
    variations.forEach((v: any) => {
        const colorAttr = v.attributes?.find((a: any) =>
            a.name.toLowerCase().includes('color') || a.slug?.includes('color'));
        if (colorAttr?.option && v.image?.src) {
            const key = colorAttr.option.toLowerCase().trim();
            if (!imgMap[key]) imgMap[key] = [];
            imgMap[key].push({ src: v.image.src, alt: v.image.alt || '' });
        }
    });
    return imgMap;
}

// ─── EXPORTS PÚBLICOS ────────────────────────────────────────────────────────
export async function getProductsPool() {
    try {
        const products = await wcFetch('/products?per_page=60&orderby=date&status=publish&stock_status=instock');
        return Array.isArray(products) ? products.map(mapV3ToStore).filter(Boolean) : [];
    } catch (e) { console.error("Error fetching products pool:", e); return []; }
}

export async function getProductById(id: number | string) {
    try {
        const product = await wcFetch(`/products/${id}`);
        if (!product) return null;
        if (product.type === 'variable') {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;
            product.variation_images_map = buildVariationImagesMap(variations);
        }
        return mapV3ToStore(product);
    } catch (e) { console.error(`Error fetching product by ID ${id}:`, e); return null; }
}

export async function getProductBySlug(slug: string) {
    try {
        const products = await wcFetch(`/products?slug=${slug}&status=publish&stock_status=instock`);
        if (!products || products.length === 0) return null;
        const product = products[0];
        if (product.type === 'variable') {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;
            product.variation_images_map = buildVariationImagesMap(variations);
        }
        return mapV3ToStore(product);
    } catch (e) { console.error("Error fetching product by slug:", e); throw e; }
}

export async function getCategoryBySlug(slug: string) {
    try {
        const categories = await wcFetch(`/products/categories?slug=${slug}`);
        return categories?.length ? categories[0] : null;
    } catch (e: any) { console.error(`Error fetching category ${slug}:`, e.message); return null; }
}

export async function getChildCategories(parentId: number) {
    try {
        const categories = await wcFetch(`/products/categories?parent=${parentId}&per_page=50`);
        if (!Array.isArray(categories)) return [];
        return categories.map((c: any) => ({
            id: c.id, name: c.name, slug: c.slug, count: c.count,
            image: c.image ? { src: c.image.src, alt: c.image.alt || c.name } : null,
        }));
    } catch (e) { console.error(`Error fetching child categories:`, e); return []; }
}

export async function getProductsByCategory(
    categoryIdOrSlug: string | number, perPage = 100, page = 1,
    orderBy: any = 'date', order: any = 'desc', onSale = false,
    attribute?: string, attributeTerm?: string | number
) {
    let finalId = categoryIdOrSlug;
    if (typeof categoryIdOrSlug === 'string' && isNaN(Number(categoryIdOrSlug))) {
        const cat = await getCategoryBySlug(categoryIdOrSlug).catch(() => null);
        if (cat) finalId = cat.id;
    }

    try {
        const ids = finalId.toString().split(',').map(id => id.trim()).filter(Boolean);
        const fetchCat = async (id: string) => {
            try {
                const data = await wcFetch(`/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}&status=publish&stock_status=instock${onSale ? '&on_sale=true' : ''}${attribute ? `&attribute=${attribute}` : ''}${attributeTerm ? `&attribute_term=${attributeTerm}` : ''}`);
                return Array.isArray(data) ? data : [];
            } catch {
                try {
                    const fb = await wcFetch(`/wc/store/v1/products?category=${id}&per_page=${perPage}`);
                    return Array.isArray(fb) ? fb : [];
                } catch { return []; }
            }
        };
        const results = await Promise.all(ids.map(fetchCat));
        const combined: any[] = [];
        const seen = new Set();
        for (const list of results) {
            for (const p of list) {
                if (p?.id && !seen.has(p.id)) { seen.add(p.id); combined.push(mapV3ToStore(p)); }
            }
        }
        return combined;
    } catch (e: any) { console.error("Error fetching products by category:", e.message); return []; }
}

export async function getPageById(id: number | string) {
    try { return await wcFetch(`/wp/v2/pages/${id}`); }
    catch (e) { console.error(`Error fetching page ${id}:`, e); return null; }
}

export async function getMenu(slug: string) {
    try { return await wcFetch(`/wh/v1/menu/${slug}`); }
    catch (e) { console.error(`Error fetching menu ${slug}:`, e); return []; }
}

export async function getAttributes() {
    try { return await wcFetch("/products/attributes"); }
    catch (e) { console.error("Error fetching attributes:", e); return []; }
}

export async function getAttributeTerms(attributeId: number | string) {
    try { return await wcFetch(`/products/attributes/${attributeId}/terms?per_page=100`); }
    catch (e) { console.error(`Error fetching terms for attribute ${attributeId}:`, e); return []; }
}

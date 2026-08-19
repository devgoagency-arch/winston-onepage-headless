/**
 * WooCommerce REST API Client for Winston & Harry
 * Using ck/cs credentials for full access and better data processing.
 */

import dns from 'node:dns';

// Resolver global de DNS públicas (Google / Cloudflare) para tienda.winstonandharrystore.com
// Esto soluciona los problemas de envenenamiento de DNS local o enrutadores locales que devuelven IPs inactivas.
if (dns && typeof dns.lookup === 'function') {
    const resolver = new dns.Resolver();
    try {
        resolver.setServers(['8.8.8.8', '1.1.1.1']);
        const originalLookup = dns.lookup;
        dns.lookup = function(hostname, options, callback) {
            let actualOptions = options;
            let actualCallback = callback;
            
            if (typeof options === 'function') {
                actualCallback = options;
                actualOptions = {};
            }
            
            if (hostname === 'tienda.winstonandharrystore.com') {
                resolver.resolve4(hostname, (err, addresses) => {
                    if (err || !addresses || addresses.length === 0) {
                        originalLookup(hostname, actualOptions, actualCallback);
                    } else {
                        if (actualOptions.all) {
                            const results = addresses.map(addr => ({ address: addr, family: 4 }));
                            actualCallback(null, results);
                        } else {
                            actualCallback(null, addresses[0], 4);
                        }
                    }
                });
            } else {
                originalLookup(hostname, options, callback);
            }
        };
    } catch (e) {
        if (typeof dns.setDefaultResultOrder === 'function') {
            dns.setDefaultResultOrder('ipv4first');
        }
    }
}

const getEnv = (key: string) => {
    const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    return metaEnv[key] || 
           metaEnv[`PUBLIC_${key}`] || 
           (typeof process !== 'undefined' ? process.env[key] : undefined) || 
           (typeof process !== 'undefined' ? process.env[`PUBLIC_${key}`] : undefined);
};

export const PUBLIC_WP_URL = import.meta.env.PUBLIC_WP_URL || 'https://tienda.winstonandharrystore.com';

// Función auxiliar para parsear IDs de imágenes de variaciones (Soporta CSV, JSON array y Array directo)
function parseVariationImageIds(metaVal: any): string[] {
    if (!metaVal) return [];
    if (typeof metaVal === 'string') {
        if (metaVal.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(metaVal);
                return Array.isArray(parsed) ? parsed.map((item: any) => (item.id?.toString() || item.toString()).trim()) : [];
            } catch (e) { return []; }
        } else {
            return metaVal.split(',').map(s => s.trim()).filter(Boolean);
        }
    } else if (Array.isArray(metaVal)) {
        return metaVal.map((item: any) => (item.id?.toString() || item.toString()).trim());
    }
    return [];
}

let WC_URL_ENV = (getEnv('WC_URL') || getEnv('WP_URL') || "https://tienda.winstonandharrystore.com").trim();

// Asegurar que use el subdominio tienda. si es el dominio principal para los llamados a la API
if (WC_URL_ENV.includes("winstonandharrystore.com") && !WC_URL_ENV.includes("tienda.")) {
    WC_URL_ENV = WC_URL_ENV.replace("winstonandharrystore.com", "tienda.winstonandharrystore.com");
}

import { EXCLUDED_SLUGS } from "./menuCategories";
export { EXCLUDED_SLUGS };

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

function normalizeQuery(text: string): string {
    if (!text) return "";
    return text.trim().toLowerCase();
}

function getCacheKeyUrl(url: string): string {
    return url
        .replace(/[&?]consumer_key=[^&]*/g, '')
        .replace(/[&?]consumer_secret=[^&]*/g, '')
        .replace(/[&?]wp_app_user=[^&]*/g, '')
        .replace(/[&?]wp_app_pass=[^&]*/g, '')
        .replace(/\?&/, '?')
        .replace(/\?$/, '');
}

async function getBuildCache(url: string): Promise<any> {
    try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const cacheDir = path.join(process.cwd(), 'public', 'data', 'build-cache');
        
        // 1. Intentar con el nombre limpio sin credenciales
        const cleanUrl = getCacheKeyUrl(url);
        const cleanSafeName = cleanUrl.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
        const cleanCachePath = path.join(cacheDir, cleanSafeName);
        if (fs.existsSync(cleanCachePath)) {
            const dataStr = fs.readFileSync(cleanCachePath, 'utf-8');
            return JSON.parse(dataStr);
        }

        // 2. Intentar con el nombre exacto original (con credenciales actuales)
        const safeName = url.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
        const cachePath = path.join(cacheDir, safeName);
        if (fs.existsSync(cachePath)) {
            const dataStr = fs.readFileSync(cachePath, 'utf-8');
            return JSON.parse(dataStr);
        }

        // 3. Fallback: buscar cualquier archivo que coincida con el patrón sin credenciales
        if (fs.existsSync(cacheDir)) {
            const cleanUrlPattern = cleanUrl.replace(/[^a-zA-Z0-9]/g, '_');
            const files = fs.readdirSync(cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const cleanFile = file
                        .replace(/_consumer_key_ck_[a-zA-Z0-9]*/, '')
                        .replace(/_consumer_secret_cs_[a-zA-Z0-9]*/, '')
                        .replace(/\.json$/, '');
                    if (cleanFile === cleanUrlPattern) {
                        const dataStr = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
                        return JSON.parse(dataStr);
                    }
                }
            }
        }
    } catch (e) {
        // Ignorar
    }
    return null;
}

async function setBuildCache(url: string, data: any) {
    try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const cacheDir = path.join(process.cwd(), 'public', 'data', 'build-cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        // Guardamos con el nombre limpio sin credenciales para que sea universal
        const cleanUrl = getCacheKeyUrl(url);
        const safeName = cleanUrl.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
        const cachePath = path.join(cacheDir, safeName);
        fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        // Ignorar
    }
}

export async function wcFetch(path: string, options: RequestInit = {}, retries = 3, delay = 1500) {
    // Leemos las claves en RUNTIME
    const CK = (getEnv('WC_CONSUMER_KEY') || getEnv('WP_CONSUMER_KEY') || "").trim();
    const CS = (getEnv('WC_CONSUMER_SECRET') || getEnv('WP_CONSUMER_SECRET') || "").trim();

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

    // 3. Determinar si requiere Auth
    const finalCleanPath = url.split('wp-json/')[1] || "";
    const isWcNamespace = finalCleanPath.startsWith('wc/');
    const isWpNamespace = finalCleanPath.startsWith('wp/');
    const isStore = finalCleanPath.includes('wc/store/');
    
    // WooCommerce requiere Auth para casi todo excepto Store API
    const needsWcAuth = isWcNamespace && !isStore;
    
    // 4. Headers base
    const headers: any = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(options.headers || {})
    };

    if (needsWcAuth && CK && CS) {
        // Auth para WooCommerce vía Query Params (más compatible)
        const connector = url.includes('?') ? '&' : '?';
        url += `${connector}consumer_key=${CK}&consumer_secret=${CS}`;

        // Redundancia vía Basic Auth
        headers['Authorization'] = `Basic ${safeBtoa(`${CK}:${CS}`)}`;
    } else if (isWpNamespace) {
        // Para wp/v2 usamos Application Passwords SOLO si están disponibles
        const WP_USER = getEnv('WP_APP_USER') || "";
        const WP_PASS = getEnv('WP_APP_PASS') || "";
        if (WP_USER && WP_PASS) {
            headers['Authorization'] = `Basic ${safeBtoa(`${WP_USER}:${WP_PASS}`)}`;
        }
        // Si no hay WP_APP_USER, la petición va sin auth (pública), 
        // que es lo ideal para la mayoría de wp/v2/pages o posts.
    }

    for (let i = 0; i < retries; i++) {
        try {
            const startTime = Date.now();
            const res = await fetch(url, { 
                ...options, 
                headers,
                signal: AbortSignal.timeout(30000)
            });
            const endTime = Date.now();
            
            // Log removed for production

            if (res.status === 401) {
                console.error(`[WC API] 401 Unauthorized en ${url.split('?')[0]}. Revisa las claves WC_CONSUMER_KEY/SECRET.`);
                const text = await res.text();
                console.error(`[WC API] Detalle error: ${text.substring(0, 500)}`);
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
            let parsed = null;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                const cleaned = text.substring(text.indexOf('{'));
                parsed = JSON.parse(cleaned);
            }

            if (parsed) {
                await setBuildCache(url, parsed);
            }
            return parsed;
        } catch (error: any) {
            if (i === retries - 1) {
                // Si falla el último intento, buscamos en el caché de build
                const cachedData = await getBuildCache(url);
                if (cachedData) {
                    console.warn(`[WC API] ⚠️ Conexión fallida para ${url.split('?')[0]}. Usando Caché de Build local.`);
                    return cachedData;
                }
                throw error;
            }
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
                .filter(p => p && p.prices.price !== "0" && p.prices.price !== "0.00" && p.stock_status !== 'outofstock');
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

    const cleanDescription = (html: string | undefined | null): string => {
        if (!html) return "";
        let cleaned = html;
        // 1. Transformación de Dominio: reemplazar dominio backend por público
        cleaned = cleaned.replace(/https:\/\/tienda\.winstonandharrystore\.com/g, 'https://www.winstonandharrystore.com');
        // 3. Normalización de Base: /product/ a /productos/ y /product-category/ a /categoria/
        cleaned = cleaned.replace(/\/product\/([^\/]+)/g, '/productos/$1');
        cleaned = cleaned.replace(/\/product-category\/([^\/]+)/g, '/categoria/$1');
        return cleaned;
    };

    p.description = cleanDescription(p.description);
    p.short_description = cleanDescription(p.short_description);

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
        
        // Final sanity check: if price is still 0, it's invalid for display
        if (p.prices.price === "0" || p.prices.price === "0.00") return null;

        p.prices.regular_price = normalizePriceStr(p.prices.regular_price);
        p.prices.sale_price = normalizePriceStr(p.prices.sale_price);
        p.prices.currency_minor_unit = 0; // Already normalized

        // Deep mapping for variations if they exist in Store API
        if (p.variations && Array.isArray(p.variations)) {
            p.variations = p.variations.map((v: any) => {
                const vPrices = v.prices || {};
                const vDetails = p.variations_data?.find((vd: any) => Number(vd.id) === Number(v.id));
                
                return {
                    ...v,
                    // Usar la imagen de la REST API v3 si existe
                    image: vDetails?.image || v.image || null,
                    stock_status: v.is_in_stock !== undefined 
                        ? (v.is_in_stock ? 'instock' : 'outofstock') 
                        : (v.stock_status || 'instock'),
                    // Normalize variation prices
                    price: (vPrices.price && normalizePriceStr(vPrices.price) !== "0") ? normalizePriceStr(vPrices.price) : p.prices.price,
                    regular_price: (vPrices.regular_price && normalizePriceStr(vPrices.regular_price) !== "0") ? normalizePriceStr(vPrices.regular_price) : (vPrices.price ? normalizePriceStr(vPrices.price) : p.prices.regular_price),
                    sale_price: vPrices.sale_price ? normalizePriceStr(vPrices.sale_price) : "",
                    attributes: (v.attributes || []).map((a: any) => ({
                        ...a,
                        option: a.value || a.option || '',
                        value: a.value || a.option || ''
                    }))
                };
            });

            // Construir variation_images_map para Store API
            const imgMap: Record<string, any[]> = {};

            // Regla de excepción para limpiar fotos de variaciones que pertenecen a otros modelos
            // (casos específicos detectados: Milan, Mompox, Winsdor, Wisbech II)
            const isForeignImage = (filename: string) => {
                if (!filename) return false;
                const slug = (p.slug || '').toLowerCase();
                const knownForeignSlugs = ['bucaramanga', 'loaiza', 'bath', 'bradford', 'buckingham', 'wessex', 'lincoln'];
                const foreign = knownForeignSlugs.find(s => filename.toLowerCase().includes(s) && slug !== s);
                if (foreign && !slug.includes(foreign)) {
                    return true; // Es una foto ajena, descartar
                }
                return false;
            };

            // 1. Primero cargamos las imágenes principales de las variaciones (para que sean las primeras)
            p.variations.forEach((v: any) => {
                const colorAttr = v.attributes?.find((a: any) => 
                     (a.name || "").toLowerCase().includes('color') || 
                     (a.id || "").toString().includes('color') ||
                     a.name === 'Pa_selecciona-el-color'
                );
                 if (colorAttr && (colorAttr.value || colorAttr.option) && v.image?.src) {
                     const rawColor = String(colorAttr.value || colorAttr.option).toLowerCase().trim();
                     const colorKey = normalizeSlug(rawColor) || rawColor;
                     if (!imgMap[colorKey]) imgMap[colorKey] = [];
                     
                     if (!imgMap[colorKey].some(img => img.src === v.image.src)) {
                         if (!isForeignImage(v.image.src)) {
                             imgMap[colorKey].push({ 
                                id: v.image.id || 0,
                                src: v.image.src, 
                                alt: v.image.alt || v.image.name || '',
                                name: v.image.name || ''
                            });
                         }
                     }
                }
            });

            // 2. Luego añadimos las de gallery_image_ids de la variación (nativas de WooCommerce)
            if (p.variations_data && Array.isArray(p.variations_data)) {
                // Construir mapa rápido id->imagen desde la galería general del producto
                const productImagesById: Record<number, any> = {};
                (p.images || []).forEach((img: any) => { if (img.id) productImagesById[img.id] = img; });

                p.variations_data.forEach((v: any) => {
                    if (!Array.isArray(v.gallery_image_ids) || v.gallery_image_ids.length === 0) return;
                    const colorAttr = v.attributes?.find((a: any) =>
                        (a.name || "").toLowerCase().includes('color') ||
                        (a.id || "").toString().includes('color') ||
                        a.name === 'Pa_selecciona-el-color'
                    );
                    const rawColor = colorAttr ? String(colorAttr.option || colorAttr.value).toLowerCase().trim() : 'default';
                    const colorKey = colorAttr ? (normalizeSlug(rawColor) || rawColor) : 'default';
                    if (!imgMap[colorKey]) imgMap[colorKey] = [];

                    v.gallery_image_ids.forEach((id: number) => {
                        const img = productImagesById[id];
                        if (img?.src && !imgMap[colorKey].some((i: any) => i.src === img.src)) {
                            if (!isForeignImage(img.src)) {
                                imgMap[colorKey].push({ id: img.id, src: img.src, alt: img.alt || img.name || p.name, name: img.name || '' });
                            }
                        } else if (!img && p.wpc_resolved_media?.[String(id)]) {
                            // Fallback: el ID no está en p.images pero sí fue resuelto via media API
                            const url = p.wpc_resolved_media[String(id)];
                            if (!imgMap[colorKey].some((i: any) => i.src === url)) {
                                if (!isForeignImage(url)) {
                                    imgMap[colorKey].push({ id, src: url, alt: p.name });
                                }
                            }
                        }
                    });
                });
            }

            // 3. Luego añadimos las de WPC (ordenadas después de la principal)
            if (p.variations_data && Array.isArray(p.variations_data) && p.wpc_resolved_media) {
                p.variations_data.forEach((v: any) => {
                    const wpcMeta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
                    if (wpcMeta?.value) {
                         const colorAttr = v.attributes?.find((a: any) => 
                             (a.name || "").toLowerCase().includes('color') || 
                             (a.id || "").toString().includes('color') ||
                             a.name === 'Pa_selecciona-el-color'
                         );
                         const rawColor = colorAttr ? String(colorAttr.option || colorAttr.value).toLowerCase().trim() : 'default';
                         const colorKey = colorAttr ? (normalizeSlug(rawColor) || rawColor) : 'default';
                         if (!imgMap[colorKey]) imgMap[colorKey] = [];
                         
                         const ids = parseVariationImageIds(wpcMeta.value);
                         ids.forEach((id: string) => {
                             const url = p.wpc_resolved_media[id];
                             if (url && !imgMap[colorKey].some(img => img.src === url)) {
                                 if (!isForeignImage(url)) {
                                     imgMap[colorKey].push({ id: parseInt(id), src: url, alt: p.name });
                                 }
                             }
                         });
                    }
                });
            }

            if (Object.keys(imgMap).length > 0) {
                p.variation_images_map = imgMap;
            }
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

    // NUEVO: Soporte para WPC Additional Variation Images
    const wpcImagesMap: Record<string, any[]> = {};
    if (p.variations_data && Array.isArray(p.variations_data)) {
        p.variations_data.forEach((v: any) => {
            const wpcMeta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
            if (wpcMeta?.value && p.wpc_resolved_media) {
                const colorAttr = v.attributes?.find((a: any) => 
                    (a.name || "").toLowerCase().includes('color') || 
                    (a.id || "").toString().includes('color') ||
                    a.name === 'Pa_selecciona-el-color'
                );
                const colorKey = colorAttr ? String(colorAttr.option || colorAttr.value).toLowerCase().trim() : 'default';
                
                if (!wpcImagesMap[colorKey]) wpcImagesMap[colorKey] = [];
                
                if (v.image && v.image.src) {
                    if (!wpcImagesMap[colorKey].some(img => img.src === v.image.src)) {
                        wpcImagesMap[colorKey].push({ id: v.image.id || parseInt(v.id || '0'), src: v.image.src, alt: v.image.alt || p.name });
                    }
                }
                const ids = parseVariationImageIds(wpcMeta.value);
                ids.forEach((id: string) => {
                    const url = p.wpc_resolved_media[id];
                    if (url && !wpcImagesMap[colorKey].some(img => img.src === url)) {
                        wpcImagesMap[colorKey].push({ 
                            id: parseInt(id),
                            src: url,
                            alt: p.name,
                            name: ""
                        });
                    }
                });
            }
        });
    }

    const mapped = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        permalink: p.permalink,
        type: p.type,
        status: p.status,
        date_created: p.date_created,
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
        variations: p.variations_data?.map((v: any) => {
            const vRawPrice = parseFloat(v.price || v.regular_price || "0");
            const vIncPrice = hasTax ? Math.round(vRawPrice * 1.19) : Math.round(vRawPrice);
            const vRegRaw = parseFloat(v.regular_price || v.price || "0");
            const vIncRegPrice = hasTax ? Math.round(vRegRaw * 1.19) : Math.round(vRegRaw);

            return {
                ...v,
                price: vIncPrice > 0 ? vIncPrice.toString() : (inclusivePrice || "0").toString(),
                regular_price: vIncRegPrice > 0 ? vIncRegPrice.toString() : (p.regular_price || vIncPrice || "0").toString(),
                stock_status: v.stock_status || 'instock',
                attributes: (v.attributes || []).map((a: any) => ({
                    ...a,
                    option: a.option || a.value || '',
                    value: a.value || a.option || '',
                }))
            };
        }) || null,
        variation_images_map: (() => {
            try {
                if (p.variation_images_map) return p.variation_images_map;
                const imgMap: Record<string, any[]> = {};

                if (p.variations_data && Array.isArray(p.variations_data)) {
                    const colorsArr = (p.attributes || []).find((a: any) => 
                        (a.name || "").toLowerCase().includes('color') || 
                        (a.slug || "").toLowerCase().includes('color')
                    )?.options || [];

                    // 1. Primero cargamos las imágenes principales de las variaciones (para que sean las primeras)
                    p.variations_data.forEach((v: any) => {
                        const colorAttr = v.attributes?.find((a: any) => {
                            const n = (a.name || "").toLowerCase();
                            const s = (a.slug || "").toLowerCase();
                            return n.includes('color') || s.includes('color') || 
                                   n.includes('selecciona-el') || s.includes('selecciona-el') ||
                                   (a.id || "").toString().includes('color') ||
                                   a.name === 'Pa_selecciona-el-color';
                        });
                        
                        if (colorAttr && (colorAttr.option || colorAttr.value) && v.image?.src) {
                             const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
                             // Usamos el slug normalizado si existe en los términos del producto, sino el valor crudo
                             const colorKey = normalizeSlug(colorValue) || colorValue;
                             
                             if (!imgMap[colorKey]) imgMap[colorKey] = [];
                             
                             if (!imgMap[colorKey].some((img: any) => img.src === v.image.src)) {
                                 imgMap[colorKey].push({ 
                                    id: v.image.id || 0,
                                    src: v.image.src, 
                                    alt: v.image.alt || v.image.name || '',
                                    name: v.image.name || ''
                                });
                             }
                        }
                    });

                    // 2. Luego añadimos las de gallery_image_ids de la variación (nativas de WooCommerce)
                    const productImagesById: Record<number, any> = {};
                    (p.images || []).forEach((img: any) => { if (img.id) productImagesById[img.id] = img; });

                    p.variations_data.forEach((v: any) => {
                        if (!Array.isArray(v.gallery_image_ids) || v.gallery_image_ids.length === 0) return;
                        const colorAttr = v.attributes?.find((a: any) => {
                            const n = (a.name || "").toLowerCase();
                            const s = (a.slug || "").toLowerCase();
                            return n.includes('color') || s.includes('color') ||
                                   n.includes('selecciona-el') || s.includes('selecciona-el') ||
                                   (a.id || "").toString().includes('color') ||
                                   a.name === 'Pa_selecciona-el-color';
                        });
                        if (!colorAttr || !(colorAttr.option || colorAttr.value)) return;
                        const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
                        const colorKey = normalizeSlug(colorValue) || colorValue;
                        if (!imgMap[colorKey]) imgMap[colorKey] = [];

                        v.gallery_image_ids.forEach((id: number) => {
                            const img = productImagesById[id];
                            if (img?.src && !imgMap[colorKey].some((i: any) => i.src === img.src)) {
                                imgMap[colorKey].push({ id: img.id, src: img.src, alt: img.alt || img.name || p.name, name: img.name || '' });
                            } else if (!img && p.wpc_resolved_media?.[String(id)]) {
                                // Fallback: el ID no está en p.images pero sí fue resuelto via media API
                                const url = p.wpc_resolved_media[String(id)];
                                if (!imgMap[colorKey].some((i: any) => i.src === url)) {
                                    imgMap[colorKey].push({ id, src: url, alt: p.name });
                                }
                            }
                        });
                    });

                    // 3. Luego añadimos las de WPC (ordenadas después de la principal)
                    p.variations_data.forEach((v: any) => {
                        const wpcMeta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
                        if (wpcMeta?.value && p.wpc_resolved_media) {
                            const colorAttr = v.attributes?.find((a: any) => {
                                const n = (a.name || "").toLowerCase();
                                const s = (a.slug || "").toLowerCase();
                                return n.includes('color') || s.includes('color') || 
                                       n.includes('selecciona-el') || s.includes('selecciona-el') ||
                                       (a.id || "").toString().includes('color') ||
                                       a.name === 'Pa_selecciona-el-color';
                            });
                            
                            if (colorAttr && (colorAttr.option || colorAttr.value)) {
                                const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
                                const colorKey = normalizeSlug(colorValue) || colorValue;

                                if (!imgMap[colorKey]) imgMap[colorKey] = [];
                                
                                // La imagen principal de la variación ya se agregó en el paso 1.
                                const ids = parseVariationImageIds(wpcMeta.value);
                                ids.forEach((id: string) => {
                                    const url = p.wpc_resolved_media[id.trim()];
                                    if (url && !imgMap[colorKey].some(img => img.src === url)) {
                                        imgMap[colorKey].push({ id: parseInt(id), src: url, alt: p.name });
                                    }
                                });
                            }
                        }
                    });
                }
                return Object.keys(imgMap).length > 0 ? imgMap : null;
            } catch (e) {
                console.error('[variation_images_map] Error:', e);
                return null;
            }
        })(),
        stock_status: p.stock_status || 'instock',
        manage_stock: p.manage_stock || false,
        stock_quantity: p.stock_quantity || null,
        // Mantener intacta la metadata SEO de RankMath / Yoast
        yoast_head_json: p.yoast_head_json || p.rank_math_seo || null,
        rank_math_seo: p.rank_math_seo || null
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

            // Resolver imágenes de WPC + gallery_image_ids que no estén en p.images
            const productImageIds = new Set((product.images || []).map((img: any) => String(img.id)));
            const allWpcIds = new Set<string>();
            variations.forEach((v: any) => {
                // IDs del plugin WPC
                const meta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
                if (meta?.value) parseVariationImageIds(meta.value).forEach((id: string) => { if (id) allWpcIds.add(id.trim()); });
                // gallery_image_ids que NO estén ya en p.images
                if (Array.isArray(v.gallery_image_ids)) {
                    v.gallery_image_ids.forEach((id: number) => {
                        const sid = String(id);
                        if (!productImageIds.has(sid)) allWpcIds.add(sid);
                    });
                }
            });

            if (allWpcIds.size > 0) {
                const idsArr = Array.from(allWpcIds);
                const mediaMap: Record<string, string> = {};
                for (let i = 0; i < idsArr.length; i += 50) {
                    const chunk = idsArr.slice(i, i + 50).join(',');
                    try {
                        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/media?include=${chunk}&per_page=100`);
                        if (res.ok) {
                            const media = await res.json();
                            if (Array.isArray(media)) {
                                media.forEach((m: any) => { mediaMap[m.id.toString()] = m.source_url; });
                            }
                        }
                    } catch (e) {
                         console.error("[WC API] Error resolving WPC media:", e);
                    }
                }
                product.wpc_resolved_media = mediaMap;
            }

            // Descubrir URLs subidas por CSV que WooCommerce ignoró (solo 1 imagen por var)
            await autoDiscoverVariationImages(product);

            // Variaciones procesadas en mapV3ToStore
        }

        const result = mapV3ToStore(product);
        return result;
    } catch (error) {
        console.error(`Error fetching product by ID ${id}:`, error);
        return null;
    }
}

/**
 * Función de auto-descubrimiento para variaciones importadas por CSV.
 * WooCommerce ignora nativamente las URLs extra, así que probamos -02, -03... si termina en -01.
 */
async function autoDiscoverVariationImages(product: any) {
    if (!product || !Array.isArray(product.variations_data)) return;
    if (!product.wpc_resolved_media) product.wpc_resolved_media = {};

    const promises: Promise<void>[] = [];

    product.variations_data.forEach((v: any) => {
        // Contar cuántas imágenes extra válidas tiene realmente
        let validExtraImages = 0;
        if (v.gallery_image_ids && Array.isArray(v.gallery_image_ids)) {
            validExtraImages = v.gallery_image_ids.filter((id: number) => {
                return product.images?.some((img: any) => img.id === id) || product.wpc_resolved_media?.[String(id)];
            }).length;
        }

        // Si ya tiene al menos 1 imagen extra válida, no necesitamos auto-descubrir
        if (validExtraImages > 0) return;

        // Ignorar si ya tiene metadata de WPC válido (que no sea el corrupto)
        const wpcMeta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
        if (wpcMeta?.value) {
            // Checkeo de sanidad por si el dato es unix time como en bilston (ej: 1,671,816,717)
            const parts = String(wpcMeta.value).split(',');
            const firstId = parseInt(parts[0].trim());
            // Si el primer ID es muy pequeño (ej: 1), probablemente es un número formateado corrupto, no un ID de WP real (que van por >80000)
            const isCorrupt = !isNaN(firstId) && firstId < 1000;
            if (!isCorrupt) return; // Si no es corrupto, ignorar porque ya tiene fotos
        }

        if (v.image?.src) {
            const match = v.image.src.match(/(.*[-_])(0?1)(\.[a-zA-Z]+)$/);
            if (match) {
                const [_, base, num, ext] = match;
                const isZeroPadded = num.startsWith('0');
                
                const discoverTask = async () => {
                    const discoveredIds: string[] = [];
                    // Probar del 2 al 6
                    for (let i = 2; i <= 6; i++) {
                        const nextNum = isZeroPadded ? String(i).padStart(2, '0') : String(i);
                        const testUrl = base + nextNum + ext;
                        try {
                            const res = await fetch(testUrl, { method: 'HEAD' });
                            if (res.ok) {
                                const mockId = `auto_${v.id}_${i}`;
                                product.wpc_resolved_media[mockId] = testUrl;
                                discoveredIds.push(mockId);
                            } else {
                                break;
                            }
                        } catch(e) {
                            break;
                        }
                    }
                    if (discoveredIds.length > 0) {
                        if (!v.meta_data) v.meta_data = [];
                        // Remover metadata corrupta si existe
                        v.meta_data = v.meta_data.filter((m: any) => m.key !== 'wpcvi_images' && m.key !== 'wd_additional_variation_images_data');
                        v.meta_data.push({
                            key: 'wpcvi_images',
                            value: discoveredIds.join(',')
                        });
                    }
                };
                promises.push(discoverTask());
            }
        }
    });

    if (promises.length > 0) {
        await Promise.all(promises);
    }
}

export const ASTRO_TO_WP_SLUG_MAP: Record<string, string> = {
    'mocasines-cuero-hombre': 'mocasin',
    'zapatos-cuero-hombre': 'zapatos',
    'botas-cuero-hombre': 'botas',
    'ropa-hombre-colombia': 'ropa',
    'maletas-morrales-cuero-hombre': 'maletas',
    'accesorios-hombre': 'accesorios',
    'tenis-hombre': 'tenis',
    'outlet-zapatos-ropa': 'outlet',
    'pantuflas-cuero-hombre': 'pantuflas',
    'tallas-grandes-zapatos-hombre': 'tallas-grandes',
    'zapatos-hechos-colombia-hombre': 'linea-colombia',
    'zapatos-cordon-hombre': 'zapatos-de-cordon',
    'zapatos-hebilla-hombre': 'zapatos-de-hebilla',
    'billeteras-cuero-hombre': 'billeteras',
    'limpieza-cuidado-zapatos': 'limpieza'
};

export const STRICT_CATEGORIES = [
    { 
        id: 195, 
        slug: 'mocasines-cuero-hombre', 
        name: 'Mocasines',
        description: 'Nuestros mocasines de cuero para hombre combinan elegancia clásica y comodidad excepcional. Perfectos para un estilo casual-elegante y uso de diario.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-mocasines-m.jpg'
    },
    { 
        id: 63,  
        slug: 'zapatos-cuero-hombre', 
        name: 'Zapatos',
        description: 'Nuestros zapatos de cuero están hechos para hombres que valoran el diseño, la comodidad y la calidad en cada detalle. Encuentra Oxford, Derby, Botas, Tenis y más.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-cat-m.jpg'
    },
    { 
        id: 194, 
        slug: 'botas-cuero-hombre', 
        name: 'Botas',
        description: 'Botas de cuero para hombre con la máxima durabilidad y estilo atemporal. Diseñadas para acompañarte a donde vayas con confort y resistencia.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-botas-m.jpg'
    },
    { 
        id: 249, 
        slug: 'ropa-hombre-colombia', 
        name: 'Ropa',
        description: 'Descubre nuestra colección de ropa de cuero y materiales premium para hombre. Chaquetas, polos, camisetas y más, hechos en Colombia con diseño exclusivo.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-m.jpg'
    },
    { 
        id: 190, 
        slug: 'maletas-morrales-cuero-hombre', 
        name: 'Maletas, Morrales y Maletines',
        description: 'Encuentra la mejor selección de maletines, morrales y maletas de viaje en cuero para hombre.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-maletas-m.jpg'
    },
    { 
        id: 126, 
        slug: 'accesorios-hombre', 
        name: 'Accesorios',
        description: 'Detalles que marcan la diferencia: cinturones, billeteras, tarjeteros y otros accesorios de cuero premium que complementan tu estilo personal.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-accesorios-m.jpg'
    },
    { 
        id: 192, 
        slug: 'tenis-hombre', 
        name: 'Tenis',
        description: 'Nuestros tenis de cuero combinan la comodidad del calzado casual con la distinción y resistencia del cuero legítimo. Perfectos para el día a día.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-tenis-m.jpg'
    },
    { 
        id: 948, 
        slug: 'outlet-zapatos-ropa', 
        name: 'Outlet',
        description: 'Aprovecha precios especiales en nuestras últimas piezas de temporadas anteriores. La misma calidad de cuero artesanal de Winston & Harry a un precio de oportunidad.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-outlet-m.jpg'
    },
    { 
        id: 431, 
        slug: 'pantuflas-cuero-hombre', 
        name: 'Pantuflas',
        description: 'Descansa en casa con la máxima distinción. Pantuflas de cuero extra suave y acolchadas para el máximo confort y descanso de tus pies.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-pantuflas-m.jpg'
    },
    { 
        id: 438, 
        slug: 'tallas-grandes-zapatos-hombre', 
        name: 'Tallas Grandes',
        description: 'Zapatos de cuero artesanal disponibles en tallas grandes (44 a 46). Diseños exclusivos con la misma comodidad y calidad que nos caracteriza.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-tallas-grandes-m.jpg'
    },
    { 
        id: 422, 
        slug: 'zapatos-hechos-colombia-hombre', 
        name: 'Línea Colombia',
        description: 'Edición especial de calzado artesanal que exalta la tradición zapatera colombiana. 100% hecho a mano con materiales nacionales de calidad premium.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-linea-colombia-m.jpg'
    },
    { 
        id: 193, 
        slug: 'zapatos-cordon-hombre', 
        name: 'Zapatos de Cordón',
        description: 'Nuestros zapatos de cordón están hechos para hombres que valoran una forma más clásica de vestir bien. Diseños versátiles, cómodos y bien hechos para acompañar looks más pulidos sin perder naturalidad.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-de-cordon-m.jpg'
    },
    { 
        id: 196, 
        slug: 'zapatos-hebilla-hombre', 
        name: 'Zapatos de Hebilla',
        description: 'Los zapatos de hebilla tienen algo especial: se sienten elegantes, distintos y llenos de intención. Son para hombres que disfrutan vestir bien y cuidar cada detalle.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-hebilla-m.jpg'
    },
    { 
        id: 187, 
        slug: 'collares-cuero-perro', 
        name: 'Collares para Perro',
        description: 'Collares de cuero legítimo para perros. Duraderos, resistentes y con acabados finos para consentir a tu mejor amigo de cuatro patas con la máxima sofisticación.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-collares-perros-m.jpg'
    },
    {
        id: 955,
        slug: 'sueteres-chalecos-hombre',
        name: 'Suéteres y Chalecos',
        description: 'Suéteres y chalecos tejidos y de materiales premium. Diseños versátiles para combinar confort y estilo en días fríos.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-m.jpg'
    },
    {
        id: 954,
        slug: 'polos-camisetas-hombre',
        name: 'Polos y Camisetas',
        description: 'Polos y camisetas hechas con los algodones más finos y horma perfecta. Básico premium e indispensable para tu día a día.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-m.jpg'
    },
    {
        id: 251,
        slug: 'medias-hombre',
        name: 'Medias',
        description: 'Medias de diseño premium con el ajuste y suavidad perfectos para acompañar tus zapatos Winston & Harry.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-m.jpg'
    },
    {
        id: 956,
        slug: 'camisas-algodon-hombre',
        name: 'Camisas',
        description: 'Camisas de algodón de la más alta calidad con acabados impecables para un look elegante y natural.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-m.jpg'
    },
    {
        id: 952,
        slug: 'chaquetas-hombre',
        name: 'Chaquetas',
        description: 'Chaquetas hechas a mano con diseño atemporal. Una tercera pieza clave para elevar cualquier atuendo.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-m.jpg'
    },
    {
        id: 964,
        slug: 'billeteras-cuero-hombre',
        name: 'Billeteras',
        description: 'Billeteras y tarjeteros de cuero legítimo para hombre. Diseños elegantes y funcionales que combinan con tu estilo.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-accesorios-m.jpg'
    },
    {
        id: 967,
        slug: 'cinturones',
        name: 'Cinturones',
        description: 'Cinturones de cuero artesanal para hombre. El complemento perfecto para cerrar cualquier look con elegancia.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-accesorios-m.jpg'
    },
    {
        id: 966,
        slug: 'gorras',
        name: 'Gorras',
        description: 'Gorras y sombreros premium para hombre. El toque final que eleva cualquier atuendo casual o formal.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-accesorios-m.jpg'
    },
    {
        id: 965,
        slug: 'limpieza-cuidado-zapatos',
        name: 'Limpieza y Cuidado',
        description: 'Productos especializados para el cuidado y limpieza de zapatos y accesorios de cuero. Mantén tus piezas como el primer día.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-accesorios-m.jpg'
    },
    {
        id: 963,
        slug: 'reatas',
        name: 'Reatas',
        description: 'Reatas y correas de cuero para hombre. Accesorios esenciales hechos con los mejores materiales.',
        image: 'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-accesorios-m.jpg'
    }
];

export function mapAstroToWpSlug(slug: string): string {
    return ASTRO_TO_WP_SLUG_MAP[slug] || slug;
}

export function mapWpToAstroSlug(wpSlug: string): string {
    const entry = Object.entries(ASTRO_TO_WP_SLUG_MAP).find(([_, wp]) => wp === wpSlug);
    return entry ? entry[0] : wpSlug;
}

export async function getCategoryBySlug(slug: string) {
    const mappedSlug = mapAstroToWpSlug(slug);
    const cacheKey = `cat_slug_${slug}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch(`/products/categories?slug=${mappedSlug}`);
        if (categories && categories.length > 0) {
            const result = {
                ...categories[0],
                slug: slug // Sobrescribimos con el slug de Astro para consistencia frontend
            };
            setStaticCached(cacheKey, result);
            return result;
        }
    } catch (error: any) {
        console.error(`Error fetching category by slug ${slug} (mapped: ${mappedSlug}):`, error.message);
    }

    // FALLBACK ESTÁTICO RESILIENTE DE SEGURIDAD (CERO-RED)
    const strictMatch = STRICT_CATEGORIES.find(c => c.slug === slug || c.slug === mappedSlug);
    if (strictMatch) {
        const result = {
            id: strictMatch.id,
            name: strictMatch.name,
            slug: strictMatch.slug,
            parent: 0,
            description: strictMatch.description || "",
            image: strictMatch.image ? { src: strictMatch.image } : null,
            meta_data: []
        };
        setStaticCached(cacheKey, result);
        console.log(`[getCategoryBySlug] Usando fallback local estático para la categoría: ${slug}`);
        return result;
    }

    return null;
}

export async function getCategoryById(id: number) {
    const cacheKey = `cat_id_${id}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const category = await wcFetch(`/products/categories/${id}`);
        if (!category) return null;
        
        setStaticCached(cacheKey, category);
        return category;
    } catch (error: any) {
        console.error(`Error fetching category by id ${id}:`, error.message);
        return null;
    }
}

/**
 * Fetch child categories of a parent category
 */
export async function getChildCategories(parentId: number) {

    try {
        // Use v3 authenticated API — public Store API was not returning subcategories reliably
        const categories = await wcFetch(`/products/categories?parent=${parentId}&per_page=50&hide_empty=true`);
        if (!categories || !Array.isArray(categories)) return [];

        // Normalize: map v3 fields to the shape the components expect (name, slug, id, image)
        const normalized = categories
            .filter((c: any) => c.count > 0 && !EXCLUDED_SLUGS.includes(c.slug))
            .map((c: any) => ({
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
 * Fetch hierarchical categories (parents and their direct children)
 */
export async function getCategoryTree() {
    const cacheKey = "wc_category_tree";
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch("/products/categories?per_page=100&hide_empty=true");
        if (!Array.isArray(categories)) return [];

        const roots = categories.filter((c: any) => c.parent === 0);
        const tree = roots.map((root: any) => ({
            id: root.id,
            name: root.name,
            slug: root.slug,
            children: categories
                .filter((c: any) => c.parent === root.id)
                .map((child: any) => ({
                    id: child.id,
                    name: child.name,
                    slug: child.slug
                }))
        }));

        setStaticCached(cacheKey, tree);
        return tree;
    } catch (error) {
        console.error("Error fetching category tree:", error);
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
        // Fetching product by slug...
        
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
                    
                    if (storeProduct.type === 'variable' && productId) {
                        const variations = await getProductVariations(productId);
                        storeProduct.variations_data = variations;
                        
                        // NUEVO: Resolver imágenes de WPC si existen
                        const allWpcIds = new Set<string>();
                        variations.forEach((v: any) => {
                            const meta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
                            if (meta?.value) parseVariationImageIds(meta.value).forEach((id: string) => { if (id) allWpcIds.add(id.trim()); });
                        });

                        if (allWpcIds.size > 0) {
                            const idsArr = Array.from(allWpcIds);
                            const mediaMap: Record<string, string> = {};
                            for (let i = 0; i < idsArr.length; i += 50) {
                                const chunk = idsArr.slice(i, i + 50).join(',');
                                try {
                                    const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/media?include=${chunk}&per_page=100`);
                                    if (res.ok) {
                                        const media = await res.json();
                                        if (Array.isArray(media)) {
                                            media.forEach((m: any) => { mediaMap[m.id.toString()] = m.source_url; });
                                        }
                                    }
                                } catch (e) {
                                    console.error("[WC API] Error resolving WPC media (StoreAPI):", e);
                                }
                            }
                            storeProduct.wpc_resolved_media = mediaMap;
                        }
                    }

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
            
            // Resolver imágenes de WPC + gallery_image_ids que no estén en p.images
            const productImageIds = new Set((product.images || []).map((img: any) => String(img.id)));
            const allWpcIds = new Set<string>();
            variations.forEach((v: any) => {
                // IDs del plugin WPC
                const meta = v.meta_data?.find((m: any) => (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value);
                if (meta?.value) parseVariationImageIds(meta.value).forEach((id: string) => { if (id) allWpcIds.add(id.trim()); });
                // gallery_image_ids que NO estén ya en p.images
                if (Array.isArray(v.gallery_image_ids)) {
                    v.gallery_image_ids.forEach((id: number) => {
                        const sid = String(id);
                        if (!productImageIds.has(sid)) allWpcIds.add(sid);
                    });
                }
            });

            if (allWpcIds.size > 0) {
                const idsArr = Array.from(allWpcIds);
                const mediaMap: Record<string, string> = {};
                for (let i = 0; i < idsArr.length; i += 50) {
                    const chunk = idsArr.slice(i, i + 50).join(',');
                    try {
                        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/media?include=${chunk}&per_page=100`);
                        if (res.ok) {
                            const media = await res.json();
                            if (Array.isArray(media)) {
                                media.forEach((m: any) => { mediaMap[m.id.toString()] = m.source_url; });
                            }
                        }
                    } catch (e) {
                         console.error("[WC API] Error resolving WPC media (slug v3):", e);
                    }
                }
                product.wpc_resolved_media = mediaMap;
            }
            
            // Descubrir URLs subidas por CSV que WooCommerce ignoró (solo 1 imagen por var)
            await autoDiscoverVariationImages(product);

            // Variaciones procesadas en mapV3ToStore
        }

        const result = mapV3ToStore(product);
        return result;
    } catch (error: any) {
        console.error(`[WC API] Error crítico en getProductBySlug "${slug}":`, error.message);
        return null;
    }
}

/**
 * Fetch all products (Generic Shop Page)
 */
export async function getAllProducts(
    perPage = 16,
    page = 1,
    orderBy = "popularity",
    order = "desc",
    onSale = false,
    maxPrice?: string
) {
    try {
        // Usar API v3 (exclusivamente, al igual que getProductsByCategory)
        // para asegurar que date_created siempre esté disponible.
        const v3Params = new URLSearchParams({
            per_page: perPage.toString(),
            page: page.toString(),
            orderby: orderBy,
            order: order,
            status: 'publish',
            stock_status: 'instock'
        });
        if (onSale) v3Params.append('on_sale', 'true');
        if (maxPrice) v3Params.append('max_price', maxPrice);

        const data = await wcFetch(`/products?${v3Params.toString()}`);
        return Array.isArray(data) ? data.map(p => mapV3ToStore(p)).filter(p => p !== null) : [];
    } catch (error: any) {
        console.error("[getAllProducts] Error:", error.message);
        return [];
    }
}

let globalSearchCache: any[] | null = null;

export async function searchProducts(query: string, perPage = 20) {
    if (!query || query.length < 2) return [];

    const normalizeQuery = (q: string) => {
        const lower = q.toLowerCase().trim();
        const commonTypos: Record<string, string> = {
            'roap': 'ropa', 'rospa': 'ropa', 'ropps': 'ropa',
            'zapato': 'zapatos', 'sapato': 'zapatos', 'zapatoz': 'zapatos',
            'mcltas': 'maletas', 'maleta': 'maletas',
            'cinturon': 'cinturones', 'sinturon': 'cinturones',
            'moka': 'mocasines', 'moccasin': 'mocasines',
            'oxford': 'oxford', 'oxfor': 'oxford',
            'bota': 'botas', 'vota': 'botas'
        };
        return commonTypos[lower] || lower;
    };

    const term = normalizeQuery(query);
    const tokens = term.split(/\s+/).filter(t => t.length >= 3 || t === term);
    if (tokens.length === 0) tokens.push(term);

    try {
        // 1. Cargar el caché global a RAM si no está cargado
        // NOTA: Vercel no incluye public/ en el bundle del Lambda, por eso
        // usamos fetch() HTTP (los archivos sí están en el CDN de Vercel como estáticos)
        if (!globalSearchCache) {
            const SITE = 'https://www.winstonandharrystore.com';
            const newCache: any[] = [];

            // Carga en paralelo todas las páginas (más rápido que secuencial)
            const fetches = Array.from({ length: 20 }, (_, i) =>
                fetch(`${SITE}/data/catalog/tienda-p${i + 1}.json`)
                    .then(r => r.ok ? r.json() : [])
                    .catch(() => [])
            );
            const pages = await Promise.all(fetches);
            for (const page of pages) {
                if (Array.isArray(page) && page.length > 0) {
                    newCache.push(...page);
                }
            }

            globalSearchCache = newCache;
            console.log(`[searchProducts] Global cache loaded with ${globalSearchCache.length} products via fetch.`);
        }


        if (!globalSearchCache || globalSearchCache.length === 0) {
            return [];
        }

        // 2. Filtrado 100% In-Memory (Súper Rápido)
        let allMatchedProducts = globalSearchCache.map(p => ({...p, _score: 0, _exactMatch: false})); // Clon superficial

        allMatchedProducts = allMatchedProducts.filter((p: any) => {
            // Extraer valores de atributos top-level si existen
            const topLevelAttrs = (p.attributes || []).map((a: any) => {
                if (Array.isArray(a.terms)) return a.terms.map((t: any) => t.name || t.slug || '').join(' ');
                if (typeof a.terms === 'string') return a.terms;
                return '';
            });

            // Extraer valores de las variaciones (color, talla, etc)
            const variationAttrs = (p.variations || []).map((v: any) => {
                if (Array.isArray(v.attributes)) {
                    return v.attributes.map((a: any) => a.value || a.option || '').join(' ');
                }
                return '';
            });

            const fullText = [
                p.name,
                p.description,
                p.short_description,
                ...(p.tags?.map((t: any) => t.name) || []),
                ...(p.categories?.map((c: any) => c.name) || []),
                ...topLevelAttrs,
                ...variationAttrs
            ].join(' ').toLowerCase();

            let matchesAll = true;
            let localScore = 0;

            for (const t of tokens) {
                if (fullText.includes(t)) {
                    localScore += 2;
                } else {
                    if (t.endsWith('s') && fullText.includes(t.slice(0, -1))) {
                        localScore += 1;
                    } else if (!t.endsWith('s') && fullText.includes(t + 's')) {
                        localScore += 1;
                    } else {
                        matchesAll = false;
                        break; // Descartamos rápido para mayor velocidad
                    }
                }
            }

            if (matchesAll) {
                p._score = localScore;
                if (p.name && p.name.toLowerCase().includes(term)) {
                    p._exactMatch = true;
                    p._score += 10;
                }
            }
            return matchesAll;
        });

        // 3. Ordenar por relevancia
        allMatchedProducts.sort((a, b) => {
            if (a._exactMatch && !b._exactMatch) return -1;
            if (!a._exactMatch && b._exactMatch) return 1;
            return (b._score || 0) - (a._score || 0);
        });

        // 4. Limpiar variables temporales y retornar
        allMatchedProducts.forEach(p => {
            delete p._exactMatch;
            delete p._score;
        });

        return allMatchedProducts.slice(0, perPage);
    } catch (error) {
        console.error("[searchProducts] Error in memory search:", error);
        return [];
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
    attributeTerm?: string | number,
    maxPrice?: string
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

        // Cargamos el mapa de relaciones padre-hijo desde la API de WooCommerce (muy rápido y cacheable)
        const parentMap = new Map<string, string>();
        try {
            const categoriesData = await wcFetch("/products/categories?per_page=100");
            if (Array.isArray(categoriesData)) {
                categoriesData.forEach((c: any) => {
                    if (c.parent !== undefined && c.parent !== null && c.parent !== 0) {
                        parentMap.set(c.id.toString(), c.parent.toString());
                    }
                });
            }
        } catch (e: any) {
            console.warn("[getProductsByCategory] Error resolviendo mapa de parentesco de categorías:", e.message);
        }

        const fetchCategory = async (id: string) => {
            try {
                // Usamos EXCLUSIVAMENTE la API v3 Autenticada.
                // La Store API v1 ignoraba silenciosamente el parámetro `category`
                // y devolvía el catálogo general, causando el bug de mezcla de categorías.
                let endpoint = `/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}&status=publish&stock_status=instock`;
                if (onSale) endpoint += '&on_sale=true';
                if (attribute) endpoint += `&attribute=${attribute}`;
                if (attributeTerm) endpoint += `&attribute_term=${attributeTerm}`;
                if (maxPrice) endpoint += `&max_price=${maxPrice}`;
                
                const data = await wcFetch(endpoint);

                return Array.isArray(data) 
                    ? data.map((p: any) => mapV3ToStore(p))
                          .filter(p => {
                              if (!p) return false;
                              
                              const categories = p.categories || [];
                              // Log para ver qué recibe Vercel realmente (Míralo en los Logs de Vercel)
                              console.log(`[DEBUG] Producto: ${p.name} (ID: ${p.id}) | Categorías:`, JSON.stringify(categories));
                              
                              const categoryMatch = categories.some((c: any) => {
                                  const catId = (typeof c === 'object' ? c.id : c)?.toString();
                                  if (!catId) return false;
                                  
                                  // Comprobación 1: Coincidencia directa con el ID solicitado
                                  if (catId === id.toString()) return true;
                                  
                                  // Comprobación 2: Comprobar si el parent de la categoría del producto es el ID solicitado
                                  const parentId = parentMap.get(catId);
                                  return parentId === id.toString();
                              });

                              return categoryMatch;
                          })
                    : [];
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
                    // Los productos ya vienen mapeados de fetchCategory
                    if (p && (p.id || p.id === 0) && !seenIds.has(p.id)) {
                        seenIds.add(p.id);
                        combined.push(p);
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
 * Menús: Lee primero desde archivos JSON estáticos (descargados en build-time).
 * Solo llama a WordPress como fallback si el archivo no existe o viene vacío.
 * Esto garantiza menús consistentes en Vercel serverless (sin caché compartida entre lambdas).
 */

// Mapa de archivos JSON por slug (cargados en build-time vía import() dinámico)
const MENU_JSON_FILES: Record<string, string> = {
    'menu-principal':    '/data/menus/menu-principal.json',
    'atencion-al-cliente': '/data/menus/atencion-al-cliente.json',
    'nosotros':          '/data/menus/nosotros.json',
    'legal':             '/data/menus/legal.json',
};

export async function getMenu(slug: string) {
    const cacheKey = `menu_${slug}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    // ── FUENTE 1: Archivo JSON estático (build-time) ─────────────────────
    // Los archivos viven en public/data/menus/ y se sirven como assets estáticos.
    // En SSR/Vercel leemos desde fetch al propio origen (evita fs en edge).
    try {
        const filePath = MENU_JSON_FILES[slug];
        if (filePath) {
            // Intentamos leer el archivo JSON estático que fue creado en pre-build
            // via scripts/fetch-menus.mjs. En Vercel SSR usamos fetch al asset público.
            const vercelUrl = import.meta.env.VERCEL_URL;
            const siteUrl = import.meta.env.PUBLIC_SITE_URL;
            const origin = vercelUrl
                ? `https://${vercelUrl}`
                : (siteUrl || 'http://localhost:4321');
            
            const jsonUrl = `${origin}${filePath}`;
            
            const jsonRes = await fetch(jsonUrl, {
                signal: AbortSignal.timeout(5000),
                headers: { 'Accept': 'application/json' }
            });
            
            if (jsonRes.ok) {
                const jsonData = await jsonRes.json();
                const items = jsonData?.items;
                if (Array.isArray(items) && items.length > 0) {
                    console.log(`[Menu] ✅ Cargado desde JSON estático: "${slug}" (${items.length} items)`);
                    setStaticCached(cacheKey, items);
                    return items;
                }
            }
        }
    } catch (e: any) {
        console.warn(`[Menu] Archivo estático no disponible para "${slug}": ${e.message}`);
    }

    // ── FUENTE 2: WordPress REST API (fallback) ───────────────────────────
    const WP_USER = import.meta.env.WP_APP_USER || "";
    const WP_PASS = import.meta.env.WP_APP_PASS || "";
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || "").trim();
    const authString = (WP_USER && WP_PASS) 
        ? safeBtoa(`${WP_USER}:${WP_PASS}`)
        : null;

    async function fetchMenuData(targetSlug: string) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            
            const url = `${PUBLIC_WP_URL}/wp-json/wh/v1/menu/${targetSlug}`;
            console.log(`[Menu] ⚠️ Usando fallback WP API para "${targetSlug}"`);
            
            const reqHeaders: Record<string, string> = {
                'Accept': 'application/json'
            };
            if (authString) {
                reqHeaders['Authorization'] = `Basic ${authString}`;
            }

            const res = await fetch(url, {
                signal: controller.signal,
                headers: reqHeaders
            });
            clearTimeout(timeout);
            
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) return data;
            }
        } catch (e: any) {
            console.warn(`[Menu] Intento fallido para slug "${targetSlug}":`, e.message);
        }
        return null; // si falla o viene vacío
    }

    try {
        // Intento 1: Slug original
        let menuItems = await fetchMenuData(slug);

        // Fallback para el menú principal si el primero falló
        if (!menuItems && slug === "menu-principal") {
            console.log("[Menu] Reintentando con slug alternativo 'principal'...");
            menuItems = await fetchMenuData("principal");
        }

        if (menuItems && Array.isArray(menuItems) && menuItems.length > 0) {
            setStaticCached(cacheKey, menuItems);
            return menuItems;
        }

        return [];
    } catch (error) {
        console.error(`[Menu] Error crítico al obtener menú "${slug}":`, error);
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

/**
 * Obtiene todos los datos de la página de Home (ID 83750) de WordPress, incluyendo campos ACF
 */
export async function getHomePageData() {
    try {
        const url = `${PUBLIC_WP_URL}/wp-json/wp/v2/pages/83750`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn("[WP API] Error fetching Home page data from 83750:", e);
    }
    return null;
}

/**
 * Fetch Home SEO tags using WordPress Page ID 83750
 */
export async function getHomeSEO() {
    const data = await getHomePageData();
    if (data) {
        // Retorna los datos estructurados tal cual los da RankMath o Yoast para WP
        return data.yoast_head_json || data.rank_math_seo || null;
    }
    return null;
}



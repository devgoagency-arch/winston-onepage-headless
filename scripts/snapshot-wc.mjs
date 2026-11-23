#!/usr/bin/env node
/**
 * scripts/snapshot-wc.mjs
 *
 * Descarga UNA sola vez (solo GET de lectura) todo lo que necesita el build de Astro
 * desde WooCommerce y WordPress, y lo guarda de forma atómica en src/data/snapshot/*.json.
 *
 * - Reintentos con backoff exponencial, límite de concurrencia (máx. 3) y timeouts.
 * - Memoización de peticiones GET para no repetir nunca un mismo recurso.
 * - Productos 404/eliminados: se omiten sin romper el snapshot ni el build, y se reportan en report.json.
 * - Validación de integridad y guardia contra caídas (>20% menos productos/categorías).
 * - Escritura atómica: si algo falla, conserva intacto el snapshot anterior y sale con código != 0.
 *
 * Uso:
 *   npm run snapshot            (o pnpm run snapshot)
 *   node scripts/snapshot-wc.mjs --force   (omite la guardia de comparación contra snapshot previo)
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { mapV3ProductToSnapshot, parseVariationImageIds } from '../src/lib/wcMapper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, 'src', 'data', 'snapshot');
const PUBLIC_PRODUCTS_DIR = path.join(ROOT, 'public', 'data', 'products');

const FORCE_OVERWRITE = process.argv.includes('--force');
const CONCURRENCY = Math.min(3, Math.max(1, Number(process.env.SNAPSHOT_CONCURRENCY || 3)));
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.SNAPSHOT_TIMEOUT_MS || 30000));
const MAX_RETRIES = Math.max(1, Number(process.env.SNAPSHOT_RETRIES || 4));
const MIN_RATIO_VS_PREV = 0.8; // Si baja de 80% respecto al snapshot anterior, aborta

// ── DNS fallback (Google / Cloudflare) para tienda.winstonandharrystore.com ──
if (dns && typeof dns.lookup === 'function') {
  try {
    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    const originalLookup = dns.lookup;
    dns.lookup = function (hostname, options, callback) {
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
          } else if (actualOptions.all) {
            actualCallback(
              null,
              addresses.map((address) => ({ address, family: 4 }))
            );
          } else {
            actualCallback(null, addresses[0], 4);
          }
        });
      } else {
        originalLookup(hostname, options, callback);
      }
    };
  } catch {
    if (typeof dns.setDefaultResultOrder === 'function') {
      dns.setDefaultResultOrder('ipv4first');
    }
  }
}

// ── Cargar .env local sin imprimir secretos ───────────────────────────────────
function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadLocalEnv();

let BASE_URL = (
  process.env.WC_URL ||
  process.env.WP_URL ||
  process.env.PUBLIC_WP_URL ||
  'https://tienda.winstonandharrystore.com'
)
  .trim()
  .replace(/\/$/, '');

if (BASE_URL.includes('winstonandharrystore.com') && !BASE_URL.includes('tienda.')) {
  BASE_URL = BASE_URL.replace('winstonandharrystore.com', 'tienda.winstonandharrystore.com');
}

const CK = (process.env.WC_CONSUMER_KEY || process.env.WP_CONSUMER_KEY || '').trim();
const CS = (process.env.WC_CONSUMER_SECRET || process.env.WP_CONSUMER_SECRET || '').trim();
const WP_USER = (process.env.WP_APP_USER || '').trim();
const WP_PASS = (process.env.WP_APP_PASS || '').trim();

if (!CK || !CS) {
  console.error('[snapshot] ERROR: Faltan WC_CONSUMER_KEY o WC_CONSUMER_SECRET en el entorno/.env.');
  process.exit(1);
}

// Semáforo único aplicado SOLO en la capa HTTP (fetchJsonGet) para evitar deadlocks.
const httpLimit = pLimit(CONCURRENCY);
// Memoización en memoria por URL limpia (evita consultas duplicadas durante la misma corrida).
const responseMemo = new Map();
let totalHttpRequests = 0;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sanitizeUrlForLog(url) {
  return String(url)
    .replace(/consumer_key=[^&]*/g, 'consumer_key=***')
    .replace(/consumer_secret=[^&]*/g, 'consumer_secret=***');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Petición GET con semáforo de concurrencia, memoización, reintentos con backoff y timeout.
 * Garantiza que nunca se usa un método distinto de GET.
 */
function fetchJsonGet(url, { headers = {}, allow404 = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const memoKey = `${sanitizeUrlForLog(url)}|auth=${headers.Authorization ? '1' : '0'}`;
  if (responseMemo.has(memoKey)) {
    return responseMemo.get(memoKey);
  }

  const promise = httpLimit(async () => {
    let delay = 1200;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        totalHttpRequests++;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
            ...headers,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 404 && allow404) {
          return { data: null, headers: res.headers, status: 404 };
        }

        if (!res.ok) {
          const retryable = [408, 429, 500, 502, 503, 504].includes(res.status);
          if (retryable && attempt < MAX_RETRIES) {
            const jitter = Math.floor(Math.random() * 400);
            console.warn(
              `[snapshot] HTTP ${res.status} en ${sanitizeUrlForLog(url)} (intento ${attempt}/${MAX_RETRIES}), reintentando en ${delay + jitter}ms...`
            );
            await sleep(delay + jitter);
            delay *= 2;
            continue;
          }
          const err = new Error(`HTTP ${res.status} en ${sanitizeUrlForLog(url)}`);
          err.status = res.status;
          throw err;
        }

        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          const startObj = text.indexOf('{');
          const startArr = text.indexOf('[');
          const idx =
            startObj >= 0 && startArr >= 0
              ? Math.min(startObj, startArr)
              : Math.max(startObj, startArr);
          if (idx >= 0) {
            parsed = JSON.parse(text.slice(idx));
          } else {
            throw new Error(`Respuesta no JSON en ${sanitizeUrlForLog(url)}`);
          }
        }

        return { data: parsed, headers: res.headers, status: res.status };
      } catch (err) {
        lastError = err;
        if (err?.status === 404 && allow404) {
          return { data: null, headers: new Headers(), status: 404 };
        }
        if (attempt < MAX_RETRIES) {
          const jitter = Math.floor(Math.random() * 400);
          console.warn(
            `[snapshot] Error en ${sanitizeUrlForLog(url)} (intento ${attempt}/${MAX_RETRIES}): ${err.message}. Reintentando...`
          );
          await sleep(delay + jitter);
          delay *= 2;
        }
      }
    }

    throw lastError || new Error(`Fallo definitivo en ${sanitizeUrlForLog(url)}`);
  });

  responseMemo.set(memoKey, promise);
  return promise;
}

function buildWcUrl(endpoint) {
  const clean = endpoint.replace(/^\/+/, '');
  const sep = clean.includes('?') ? '&' : '?';
  return `${BASE_URL}/wp-json/wc/v3/${clean}${sep}consumer_key=${encodeURIComponent(CK)}&consumer_secret=${encodeURIComponent(CS)}`;
}

function getWpAuthHeaders() {
  if (WP_USER && WP_PASS) {
    return {
      Authorization: `Basic ${Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64')}`,
    };
  }
  return {};
}

async function fetchWpJson(endpoint, { allow404 = false, preferAuth = true } = {}) {
  const clean = endpoint.replace(/^\/+/, '');
  const url = `${BASE_URL}/wp-json/${clean}`;
  if (preferAuth && WP_USER && WP_PASS) {
    try {
      return await fetchJsonGet(url, { headers: getWpAuthHeaders(), allow404 });
    } catch (err) {
      if (err?.status === 401 || err?.status === 403 || String(err.message).includes('401') || String(err.message).includes('403')) {
        return fetchJsonGet(url, { allow404 });
      }
      throw err;
    }
  }
  return fetchJsonGet(url, { allow404 });
}

async function fetchAllWcPages(endpointBase, { perPage = 100, maxPages = 30, allow404 = false } = {}) {
  const all = [];
  const sep = endpointBase.includes('?') ? '&' : '?';

  for (let page = 1; page <= maxPages; page++) {
    const url = buildWcUrl(`${endpointBase}${sep}per_page=${perPage}&page=${page}`);
    const { data, headers, status } = await fetchJsonGet(url, { allow404 });
    if (status === 404) return null;
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);

    const totalPages = Number(headers.get('x-wp-totalpages') || 0);
    if (totalPages > 0 && page >= totalPages) break;
    if (data.length < perPage) break;
  }

  return all;
}

async function fetchAllWpPages(endpointBase, { perPage = 100, maxPages = 20 } = {}) {
  const all = [];
  const sep = endpointBase.includes('?') ? '&' : '?';

  for (let page = 1; page <= maxPages; page++) {
    const { data, headers, status } = await fetchWpJson(
      `${endpointBase}${sep}per_page=${perPage}&page=${page}`,
      { allow404: true, preferAuth: false }
    );
    if (status === 404 || !Array.isArray(data) || data.length === 0) break;
    all.push(...data);

    const totalPages = Number(headers.get('x-wp-totalpages') || 0);
    if (totalPages > 0 && page >= totalPages) break;
    if (data.length < perPage) break;
  }

  return all;
}

async function resolveMediaIds(idsSet) {
  const ids = Array.from(idsSet)
    .map((id) => String(id).trim())
    .filter((id) => /^\d+$/.test(id) && Number(id) >= 1000);

  const mediaMap = {};
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const { data } = await fetchWpJson(
          `wp/v2/media?include=${chunk.join(',')}&per_page=100&_fields=id,source_url`,
          { preferAuth: false }
        );
        if (Array.isArray(data)) {
          for (const m of data) {
            if (m?.id && m?.source_url) {
              mediaMap[String(m.id)] = m.source_url;
            }
          }
        }
      } catch (err) {
        console.warn(`[snapshot] Aviso resolviendo media (${chunk.length} IDs): ${err.message}`);
      }
    })
  );

  return mediaMap;
}

function extractBannerCandidate(acfData, metaData, keys) {
  for (const key of keys) {
    const val = acfData?.[key];
    if (!val) continue;
    if (typeof val === 'string' && val.startsWith('http')) return { url: val, mediaId: null };
    if (typeof val === 'object' && val.url) return { url: val.url, mediaId: null };
    if (!isNaN(Number(val)) && Number(val) > 0) return { url: null, mediaId: String(val) };
  }
  for (const key of keys) {
    const meta = Array.isArray(metaData) ? metaData.find((m) => m?.key === key) : null;
    const val = meta?.value;
    if (!val) continue;
    if (typeof val === 'string' && val.startsWith('http')) return { url: val, mediaId: null };
    if (typeof val === 'object' && val.url) return { url: val.url, mediaId: null };
    if (!isNaN(Number(val)) && Number(val) > 0) return { url: null, mediaId: String(val) };
  }
  return { url: null, mediaId: null };
}

async function fetchCategoriesSnapshot() {
  console.log('[snapshot] 1/5 Descargando categorías...');
  const [wcCategories, wpProductCats] = await Promise.all([
    fetchAllWcPages('products/categories'),
    fetchAllWpPages('wp/v2/product_cat'),
  ]);

  if (!Array.isArray(wcCategories)) {
    throw new Error('No se pudieron descargar las categorías de WooCommerce.');
  }

  const wpById = new Map();
  const wpBySlug = new Map();
  for (const c of wpProductCats) {
    if (c?.id) wpById.set(c.id, c);
    if (c?.slug) wpBySlug.set(c.slug, c);
  }

  const desktopKeys = ['banner_categoria_desktop', 'banner_desktop', 'banner_categoria'];
  const mobileKeys = ['imagen_categoria_movil', 'banner_mobile', 'banner_movil'];

  const mediaIdsToResolve = new Set();
  const pending = wcCategories.map((cat) => {
    const wpCat = wpById.get(cat.id) || wpBySlug.get(cat.slug) || null;
    const acf = wpCat?.acf || {};
    const desktop = extractBannerCandidate(acf, cat.meta_data, desktopKeys);
    const mobile = extractBannerCandidate(acf, cat.meta_data, mobileKeys);
    if (desktop.mediaId) mediaIdsToResolve.add(desktop.mediaId);
    if (mobile.mediaId) mediaIdsToResolve.add(mobile.mediaId);
    return { cat, acf, desktop, mobile };
  });

  const mediaMap = mediaIdsToResolve.size > 0 ? await resolveMediaIds(mediaIdsToResolve) : {};

  const enriched = pending.map(({ cat, acf, desktop, mobile }) => {
    const desktopBanner =
      desktop.url || (desktop.mediaId ? mediaMap[desktop.mediaId] : null) || cat.image?.src || null;
    const mobileBanner =
      mobile.url || (mobile.mediaId ? mediaMap[mobile.mediaId] : null) || desktopBanner;

    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parent: Number(cat.parent || 0),
      description: cat.description || '',
      count: Number(cat.count || 0),
      image: cat.image?.src
        ? { id: cat.image.id || 0, src: cat.image.src, alt: cat.image.alt || cat.name }
        : null,
      desktop_banner: desktopBanner,
      mobile_banner: mobileBanner,
      wp_acf: acf,
      yoast_head_json: cat.yoast_head_json || null,
      rank_math_seo: cat.rank_math_seo || null,
    };
  });

  console.log(`[snapshot]    ✓ ${enriched.length} categorías descargadas.`);
  return enriched;
}

async function fetchProductsSnapshot(prevProducts) {
  console.log('[snapshot] 2/5 Descargando productos publicados...');
  const rawProducts = await fetchAllWcPages('products?status=publish');
  if (!Array.isArray(rawProducts)) {
    throw new Error('No se pudieron descargar los productos publicados de WooCommerce.');
  }
  console.log(`[snapshot]    ✓ ${rawProducts.length} productos publicados base descargados.`);

  const skipped404 = [];
  const skippedInvalid = [];

  // Verificar producto especial 'test' si existe en WC (puede estar oculto del catálogo pero publicado)
  if (!rawProducts.some((p) => p.slug === 'test')) {
    try {
      const { data, status } = await fetchJsonGet(buildWcUrl('products?slug=test'), { allow404: true });
      if (status !== 404 && Array.isArray(data) && data.length > 0 && data[0].status === 'publish') {
        rawProducts.push(data[0]);
        console.log('[snapshot]    + Producto especial "test" incluido.');
      }
    } catch {
      // Opcional
    }
  }

  // Solo pedir variaciones a productos variables que efectivamente tienen variation IDs
  const variableProducts = rawProducts.filter(
    (p) => p.type === 'variable' && p.id && (!Array.isArray(p.variations) || p.variations.length > 0)
  );
  console.log(
    `[snapshot]    Descargando variaciones de ${variableProducts.length} productos variables (concurrencia ${CONCURRENCY})...`
  );

  let varsCompleted = 0;
  const mediaIdsToResolve = new Set();
  const excludedProductIds = new Set();

  await Promise.all(
    variableProducts.map(async (product) => {
      try {
        const variations = await fetchAllWcPages(`products/${product.id}/variations`, {
          perPage: 100,
          maxPages: 5,
          allow404: true,
        });

        if (variations === null) {
          excludedProductIds.add(product.id);
          skipped404.push({
            slug: product.slug,
            id: product.id,
            name: product.name,
            reason: 'variations_endpoint_404',
          });
          console.warn(`[snapshot]    ⚠ Producto "${product.slug}" (#${product.id}) dio 404 en variaciones; se omite.`);
          return;
        }

        product.variations_data = variations;

        const productImageIds = new Set((product.images || []).map((img) => String(img.id)));
        for (const v of variations) {
          const meta = v.meta_data?.find(
            (m) =>
              (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') &&
              m.value
          );
          if (meta?.value) {
            for (const id of parseVariationImageIds(meta.value)) {
              if (id && /^\d+$/.test(id) && Number(id) >= 1000) {
                mediaIdsToResolve.add(id);
              }
            }
          }
          if (Array.isArray(v.gallery_image_ids)) {
            for (const id of v.gallery_image_ids) {
              const sid = String(id);
              if (!productImageIds.has(sid) && Number(id) >= 1000) {
                mediaIdsToResolve.add(sid);
              }
            }
          }
        }
      } catch (err) {
        if (err?.status === 404) {
          excludedProductIds.add(product.id);
          skipped404.push({
            slug: product.slug,
            id: product.id,
            name: product.name,
            reason: 'variations_404',
          });
          console.warn(`[snapshot]    ⚠ Producto "${product.slug}" (#${product.id}) dio 404; se omite.`);
        } else {
          throw err;
        }
      } finally {
        varsCompleted++;
        if (varsCompleted % 50 === 0 || varsCompleted === variableProducts.length) {
          console.log(`[snapshot]    Variaciones: ${varsCompleted}/${variableProducts.length}`);
        }
      }
    })
  );

  if (mediaIdsToResolve.size > 0) {
    console.log(
      `[snapshot]    Resolviendo ${mediaIdsToResolve.size} imágenes de galería de variaciones...`
    );
    const mediaMap = await resolveMediaIds(mediaIdsToResolve);
    for (const product of variableProducts) {
      product.wpc_resolved_media = mediaMap;
    }
  }

  const mappedProducts = [];
  const omittedProducts = [];

  for (const raw of rawProducts) {
    if (excludedProductIds.has(raw.id)) continue;
    const mapped = mapV3ProductToSnapshot(raw);
    if (!mapped || !mapped.slug) {
      skippedInvalid.push({ id: raw.id, slug: raw.slug || '', reason: 'invalid_mapping' });
      continue;
    }

    const priceNum = Number(mapped.prices?.price || 0);
    if (!(Number.isFinite(priceNum) && priceNum > 0)) {
      omittedProducts.push({
        slug: mapped.slug,
        id: mapped.id,
        name: mapped.name,
        reason: 'price_zero_or_invalid',
      });
      continue;
    }

    if (mapped.stock_status === 'outofstock') {
      omittedProducts.push({
        slug: mapped.slug,
        id: mapped.id,
        name: mapped.name,
        reason: 'parent_out_of_stock',
      });
      continue;
    }

    if (mapped.type === 'variable') {
      const vars = Array.isArray(mapped.variations) ? mapped.variations : [];
      if (vars.length === 0 || !vars.some((v) => v.stock_status !== 'outofstock')) {
        omittedProducts.push({
          slug: mapped.slug,
          id: mapped.id,
          name: mapped.name,
          reason: 'all_variations_out_of_stock_store_api_404',
        });
        continue;
      }
    }

    mappedProducts.push(mapped);
  }

  if (omittedProducts.length > 0) {
    console.log(
      `[snapshot]    ⚠ Omitidos ${omittedProducts.length} productos no publicables (sin stock / precio 0 / 404 en Store API):`
    );
    for (const entry of omittedProducts) {
      console.log(`       - ${entry.slug} (#${entry.id}): ${entry.reason}`);
    }
  }

  // Detectar slugs viejos/404 presentes en public/data/products/*.json o en el snapshot anterior
  // que ya no están en los productos publicables vigentes.
  const currentSlugSet = new Set(mappedProducts.map((p) => p.slug));
  const omittedBySlug = new Map(omittedProducts.map((p) => [p.slug, p]));
  const previousSlugs = new Set();

  if (fs.existsSync(PUBLIC_PRODUCTS_DIR)) {
    for (const file of fs.readdirSync(PUBLIC_PRODUCTS_DIR)) {
      if (file.endsWith('.json')) {
        previousSlugs.add(file.replace(/\.json$/, ''));
      }
    }
  }
  if (Array.isArray(prevProducts)) {
    for (const p of prevProducts) {
      if (p?.slug) previousSlugs.add(p.slug);
    }
  }

  const missingSlugs = [...previousSlugs].filter((slug) => !currentSlugSet.has(slug)).sort();
  let staleOr404Slugs = [];

  if (missingSlugs.length > 0) {
    // Una sola consulta de lectura para clasificar borradores/privados/papelera vs eliminados (404)
    const nonPublishMap = new Map();
    const uncategorizedMissing = missingSlugs.filter((s) => !omittedBySlug.has(s));
    if (uncategorizedMissing.length > 0) {
      try {
        const nonPub = await fetchAllWcPages('products?status=draft,private,pending,trash&_fields=id,slug,status', {
          perPage: 100,
          maxPages: 5,
        });
        if (Array.isArray(nonPub)) {
          for (const p of nonPub) {
            if (p?.slug) nonPublishMap.set(p.slug, { id: p.id, status: p.status });
          }
        }
      } catch {
        // Si falla esta clasificación informativa, igual reportamos los slugs ausentes
      }
    }

    staleOr404Slugs = missingSlugs.map((slug) => {
      const omittedHit = omittedBySlug.get(slug);
      if (omittedHit) return omittedHit;
      const found = nonPublishMap.get(slug);
      return found
        ? { slug, id: found.id, reason: `wc_status_${found.status}` }
        : { slug, id: null, reason: 'not_found_404' };
    });

    console.log(
      `[snapshot]    ⚠ ${staleOr404Slugs.length} JSONs viejos/404 serán eliminados de public/data/products:`
    );
    for (const entry of staleOr404Slugs) {
      console.log(`       - ${entry.slug} (${entry.reason})`);
    }
  }

  console.log(`[snapshot]    ✓ ${mappedProducts.length} productos publicables mapeados.`);
  return {
    products: mappedProducts,
    skipped404,
    skippedInvalid,
    omittedProducts,
    staleOr404Slugs,
  };
}

async function fetchMenusSnapshot() {
  console.log('[snapshot] 3/5 Descargando menús...');
  const slugs = ['menu-principal', 'atencion-al-cliente', 'nosotros', 'legal'];
  const menus = {};

  for (const slug of slugs) {
    let items = null;
    try {
      const { data } = await fetchWpJson(`wh/v1/menu/${slug}`, { allow404: true });
      if (Array.isArray(data) && data.length > 0) {
        items = data;
      }
    } catch (err) {
      console.warn(`[snapshot]    Aviso en menú "${slug}": ${err.message}`);
    }

    if (!items && slug === 'menu-principal') {
      try {
        const { data } = await fetchWpJson('wh/v1/menu/principal', { allow404: true });
        if (Array.isArray(data) && data.length > 0) {
          items = data;
        }
      } catch {
        // se valida abajo
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`El menú "${slug}" vino vacío o falló al descargarse.`);
    }

    menus[slug] = items;
    console.log(`[snapshot]    ✓ Menú "${slug}": ${items.length} items.`);
  }

  return menus;
}

async function fetchAttributesSnapshot() {
  console.log('[snapshot] 4/5 Descargando atributos y términos...');
  const { data: attrs } = await fetchJsonGet(buildWcUrl('products/attributes'));
  if (!Array.isArray(attrs)) {
    throw new Error('Respuesta inválida al descargar atributos de WooCommerce.');
  }

  const enriched = await Promise.all(
    attrs.map(async (attr) => {
      const terms = await fetchAllWcPages(`products/attributes/${attr.id}/terms`, {
        perPage: 100,
        maxPages: 10,
      });
      return {
        id: attr.id,
        name: attr.name,
        slug: attr.slug,
        type: attr.type || 'select',
        terms: (terms || []).map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          count: Number(t.count || 0),
        })),
      };
    })
  );

  console.log(`[snapshot]    ✓ ${enriched.length} atributos descargados.`);
  return enriched;
}

async function fetchCmsSnapshot(productsById, prevCms) {
  console.log('[snapshot] 5/5 Descargando contenido CMS (home, banners, look, blog, páginas)...');

  const safeWp = async (endpoint, label, preferAuth = false) => {
    try {
      const { data } = await fetchWpJson(endpoint, { allow404: true, preferAuth });
      return data;
    } catch (err) {
      console.warn(`[snapshot]    Aviso en ${label}: ${err.message}`);
      return null;
    }
  };

  const [
    homePage,
    homeBannerRaw,
    homeCategoriesRaw,
    heroSlidesRaw,
    lookRaw,
    blogPostsRaw,
    page14662,
    page14680,
    page14599,
    page1629,
  ] = await Promise.all([
    safeWp('wp/v2/pages/83750', 'homePage (83750)', false),
    safeWp('wp/v2/home_banner?per_page=1&_fields=meta', 'home_banner', true),
    safeWp('wp/v2/home_categories_sec?per_page=1&_embed', 'home_categories_sec', true),
    safeWp('wp/v2/home_banner_hero?per_page=5', 'home_banner_hero', true),
    safeWp('wp/v2/look-semana?per_page=1&_embed', 'look-semana', true),
    safeWp('wp/v2/posts?per_page=4&status=publish&_embed', 'blogPosts', false),
    safeWp('wp/v2/pages/14662', 'page guia-de-tallas (14662)', false),
    safeWp('wp/v2/pages/14680', 'page politica-cookies (14680)', false),
    safeWp('wp/v2/pages/14599', 'page politica-costos-envio (14599)', false),
    safeWp('wp/v2/pages/1629', 'page politica-privacidad (1629)', false),
  ]);

  let heroSlides = { slides: [], slots: 0 };
  if (Array.isArray(heroSlidesRaw) && heroSlidesRaw.length > 0 && heroSlidesRaw[0]?.banner_data) {
    const heroPost = heroSlidesRaw[0];
    const slides = heroPost.banner_data.slides || [];
    const acfMobile = heroPost.acf?.mobile_images || [];
    const heroMediaIds = new Set();

    const rawMobiles = slides.map((slide, idx) => {
      const singleFieldImage = heroPost.acf?.[`mobile_image_${idx + 1}`] || '';
      const raw =
        slide.media_url_mobile ||
        singleFieldImage ||
        acfMobile[idx]?.mobile_image ||
        acfMobile[idx]?.mobile_url ||
        '';
      const str = String(raw || '').trim();
      if (/^\d+$/.test(str) && Number(str) >= 1000) heroMediaIds.add(str);
      return str;
    });

    const heroMediaMap = heroMediaIds.size > 0 ? await resolveMediaIds(heroMediaIds) : {};
    heroSlides = {
      slides: slides.map((slide, idx) => {
        const raw = rawMobiles[idx];
        const resolved = heroMediaMap[raw] || raw;
        return { ...slide, media_url_mobile: resolved };
      }),
      slots: parseInt(heroPost.banner_data.slots, 10) || 1,
    };
  }

  let lookOfTheWeek = null;
  if (Array.isArray(lookRaw) && lookRaw.length > 0 && lookRaw[0]) {
    const look = lookRaw[0];
    const productIds = [look.custom_fields?.look_producto_1, look.custom_fields?.look_producto_2]
      .filter(Boolean)
      .map((id) => Number(id));

    const lookProducts = [];
    for (const id of productIds) {
      let prod = productsById.get(id) || null;
      if (!prod) {
        try {
          const { data: rawProd, status } = await fetchJsonGet(buildWcUrl(`products/${id}`), {
            allow404: true,
          });
          if (status !== 404 && rawProd?.id) {
            if (rawProd.type === 'variable') {
              const vars = await fetchAllWcPages(`products/${rawProd.id}/variations`, {
                perPage: 100,
                maxPages: 5,
                allow404: true,
              });
              rawProd.variations_data = vars || [];
            }
            prod = mapV3ProductToSnapshot(rawProd);
          }
        } catch (err) {
          console.warn(
            `[snapshot]    Aviso: no se pudo resolver producto ${id} del Look: ${err.message}`
          );
        }
      }
      if (prod) lookProducts.push(prod);
    }

    lookOfTheWeek = {
      id: look.id,
      look_titulo: look.custom_fields?.look_titulo || look.title?.rendered || 'LOOK DE LA SEMANA',
      look_descripcion: look.custom_fields?.look_descripcion || look.content?.rendered || '',
      look_imagen:
        look.custom_fields?.look_imagen || look._embedded?.['wp:featuredmedia']?.[0]?.source_url || '',
      products: lookProducts,
    };
  }

  let homeCategories = null;
  if (Array.isArray(homeCategoriesRaw) && homeCategoriesRaw.length > 0) {
    const post = homeCategoriesRaw[0];
    const secData = post.categories_section_data || {};
    const acf = post.acf || {};
    const title =
      secData.titulo ||
      (typeof acf.titulo_de_la_seccion === 'string' ? acf.titulo_de_la_seccion : null) ||
      post.title?.rendered ||
      'ROPA Y ZAPATOS PARA HOMBRE';
    const subtitle =
      secData.subtitulo ||
      (typeof acf.subtitulo_de_la_seccion === 'string' ? acf.subtitulo_de_la_seccion : null) ||
      post.content?.rendered ||
      '';

    let categories = [];
    if (Array.isArray(secData.categories) && secData.categories.length > 0) {
      categories = secData.categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        image: c.image || '',
      }));
    } else {
      const rawCats = acf.categorias_y_fotos || [];
      categories = rawCats
        .filter((item) => item?.categoria)
        .map((item) => {
          const cat = item.categoria;
          let imageUrl = '';
          if (typeof item.imagen_personalizada === 'string') {
            imageUrl = item.imagen_personalizada;
          } else if (item.imagen_personalizada && typeof item.imagen_personalizada === 'object') {
            imageUrl = item.imagen_personalizada.url || item.imagen_personalizada.source_url || '';
          }
          return {
            id: cat?.term_id || 0,
            name: cat?.name || 'Sin Nombre',
            slug: cat?.slug || '',
            image: imageUrl,
          };
        });
    }

    homeCategories = { title, subtitle, categories };
  }

  let beholdPosts = Array.isArray(prevCms?.beholdPosts) ? prevCms.beholdPosts : [];
  try {
    const res = await fetch('https://feeds.behold.so/RVqh8VIima5lSF9u1b3q?limit=50', {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.posts)) {
        beholdPosts = data.posts;
      }
    }
  } catch (err) {
    console.warn(`[snapshot]    Aviso Behold (no crítico): ${err.message}`);
  }

  const compactPage = (p) =>
    p
      ? {
          id: p.id,
          slug: p.slug,
          title: p.title,
          content: p.content,
          acf: p.acf || null,
          yoast_head_json: p.yoast_head_json || null,
          rank_math_seo: p.rank_math_seo || null,
        }
      : null;

  const compactBlogPosts = Array.isArray(blogPostsRaw)
    ? blogPostsRaw.map((post) => ({
        id: post.id,
        slug: post.slug,
        date: post.date,
        title: post.title,
        acf: post.acf || null,
        _embedded: {
          'wp:featuredmedia': post._embedded?.['wp:featuredmedia']?.map((m) => ({
            source_url: m.source_url,
          })),
          'wp:term': post._embedded?.['wp:term']?.map((group) =>
            Array.isArray(group) ? group.map((t) => ({ id: t.id, name: t.name, slug: t.slug })) : []
          ),
        },
      }))
    : [];

  const cms = {
    homePage: compactPage(homePage),
    homeBannerRaw: Array.isArray(homeBannerRaw) && homeBannerRaw.length > 0 ? homeBannerRaw[0] : null,
    homeCategories,
    heroSlides,
    lookOfTheWeek,
    blogPosts: compactBlogPosts,
    beholdPosts,
    pages: {
      '14662': compactPage(page14662),
      '14680': compactPage(page14680),
      '14599': compactPage(page14599),
      '1629': compactPage(page1629),
    },
  };

  console.log(
    `[snapshot]    ✓ CMS listo (blogPosts: ${compactBlogPosts.length}, look: ${lookOfTheWeek ? 'sí' : 'no'}, homeBanner: ${cms.homeBannerRaw ? 'sí' : 'fallback'}).`
  );
  return cms;
}

function readPreviousJson(fileName) {
  const filePath = path.join(SNAPSHOT_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function validateAgainstPrevious(newData, prevManifest) {
  const { products, categories, menus } = newData;

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('La descarga de productos salió vacía.');
  }
  const inStockWithPrice = products.filter(
    (p) => p.stock_status !== 'outofstock' && Number(p.prices?.price || 0) > 0
  );
  if (inStockWithPrice.length === 0) {
    throw new Error('Ningún producto descargado tiene stock y precio válido.');
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('La descarga de categorías salió vacía.');
  }

  for (const requiredMenu of ['menu-principal', 'atencion-al-cliente', 'nosotros', 'legal']) {
    if (!Array.isArray(menus[requiredMenu]) || menus[requiredMenu].length === 0) {
      throw new Error(`El menú obligatorio "${requiredMenu}" está vacío.`);
    }
  }

  if (prevManifest && !FORCE_OVERWRITE) {
    const prevProducts = Number(prevManifest.counts?.products || 0);
    const prevCategories = Number(prevManifest.counts?.categories || 0);

    if (prevProducts > 0 && products.length < Math.floor(prevProducts * MIN_RATIO_VS_PREV)) {
      throw new Error(
        `Guardia de seguridad: se descargaron solo ${products.length} productos vs ${prevProducts} en el snapshot anterior (< ${Math.round(MIN_RATIO_VS_PREV * 100)}%). Se conserva el snapshot anterior. Usa --force solo si la reducción es intencional.`
      );
    }

    if (prevCategories > 0 && categories.length < Math.floor(prevCategories * MIN_RATIO_VS_PREV)) {
      throw new Error(
        `Guardia de seguridad: se descargaron solo ${categories.length} categorías vs ${prevCategories} en el snapshot anterior (< ${Math.round(MIN_RATIO_VS_PREV * 100)}%). Se conserva el snapshot anterior.`
      );
    }
  }
}

function writeSnapshotAtomically(files) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const tmpDir = path.join(SNAPSHOT_DIR, `.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const [name, content] of Object.entries(files)) {
      const pretty = name === 'manifest.json' || name === 'report.json';
      const serialized = pretty ? JSON.stringify(content, null, 2) + '\n' : JSON.stringify(content);
      const tmpPath = path.join(tmpDir, name);
      fs.writeFileSync(tmpPath, serialized, 'utf-8');
      JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
    }

    const names = Object.keys(files).sort((a, b) =>
      a === 'manifest.json' ? 1 : b === 'manifest.json' ? -1 : a.localeCompare(b)
    );
    for (const name of names) {
      fs.renameSync(path.join(tmpDir, name), path.join(SNAPSHOT_DIR, name));
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const startedAt = Date.now();
  console.log('\n📦 Winston & Harry — Generando snapshot de WooCommerce/WP (solo GET)...');
  console.log(`   Origen: ${BASE_URL}`);
  console.log(`   Concurrencia: ${CONCURRENCY} | Timeout: ${REQUEST_TIMEOUT_MS}ms | Reintentos: ${MAX_RETRIES}\n`);

  const prevManifest = readPreviousJson('manifest.json');
  const prevProducts = readPreviousJson('products.json');
  const prevCms = readPreviousJson('cms.json');

  const categories = await fetchCategoriesSnapshot();
  const { products, skipped404, skippedInvalid, omittedProducts, staleOr404Slugs } = await fetchProductsSnapshot(prevProducts);
  const productsById = new Map(products.map((p) => [p.id, p]));
  const menus = await fetchMenusSnapshot();
  const attributes = await fetchAttributesSnapshot();
  const cms = await fetchCmsSnapshot(productsById, prevCms);

  validateAgainstPrevious({ products, categories, menus }, prevManifest);

  const inStockCount = products.filter(
    (p) => p.stock_status !== 'outofstock' && Number(p.prices?.price || 0) > 0
  ).length;
  const omittedAllVarsOos = omittedProducts.filter(
    (p) => p.reason === 'all_variations_out_of_stock_store_api_404'
  );

  const generatedAt = new Date().toISOString();

  const manifest = {
    version: 1,
    generatedAt,
    sourceUrl: BASE_URL,
    counts: {
      products: products.length,
      productsInStock: inStockCount,
      omittedProducts: omittedProducts.length,
      omittedAllVariationsOutOfStock: omittedAllVarsOos.length,
      categories: categories.length,
      attributes: attributes.length,
      menus: Object.fromEntries(Object.entries(menus).map(([k, v]) => [k, v.length])),
      blogPosts: cms.blogPosts.length,
      pages: Object.values(cms.pages).filter(Boolean).length,
      skipped404: skipped404.length,
      staleOr404SlugsRemoved: staleOr404Slugs.length,
    },
  };

  const report = {
    generatedAt,
    durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    totalHttpRequests,
    productsPublishable: products.length,
    omittedTotal: omittedProducts.length,
    skipped404,
    skippedInvalid,
    omittedAllVariationsOutOfStock: omittedAllVarsOos,
    omittedProducts,
    staleOr404SlugsRemoved: staleOr404Slugs,
  };

  writeSnapshotAtomically({
    'categories.json': categories,
    'products.json': products,
    'menus.json': menus,
    'attributes.json': attributes,
    'cms.json': cms,
    'report.json': report,
    'manifest.json': manifest,
  });

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n✅ Snapshot guardado atómicamente en src/data/snapshot/ (${elapsedSec}s, ${totalHttpRequests} peticiones GET)`);
  console.log(
    `   Productos publicables: ${manifest.counts.products} | Omitidos (404/sin stock/precio 0): ${omittedProducts.length} | Categorías: ${manifest.counts.categories} | Atributos: ${manifest.counts.attributes}`
  );
  if (skipped404.length > 0 || omittedProducts.length > 0 || staleOr404Slugs.length > 0) {
    console.log(
      `   Detalle de omitidos/404 guardado en src/data/snapshot/report.json`
    );
  }
}

main().catch((err) => {
  console.error(`\n❌ Error generando snapshot (se conserva la copia anterior): ${err.message}`);
  process.exit(1);
});

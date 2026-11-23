#!/usr/bin/env node
/**
 * scripts/prepare-from-snapshot.mjs
 *
 * Corre ANTES de `astro build` y `astro dev` (100% offline, cero red):
 * 1. Ejecuta la guardia de integridad sobre src/data/snapshot/*.json.
 * 2. Regenera public/data/menus/*.json desde src/data/snapshot/menus.json.
 * 3. Regenera public/data/products/*.json desde src/data/snapshot/products.json
 *    (eliminando cualquier JSON viejo/404 que ya no esté en el snapshot).
 * 4. Regenera public/data/catalog/*.json (tienda-all, sale-all, sale-home y cada categoría)
 *    desde src/data/snapshot/products.json + categories.json.
 *
 * Uso:
 *   node scripts/prepare-from-snapshot.mjs
 *   node scripts/prepare-from-snapshot.mjs --validate-only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateSnapshot,
  EXCLUDED_CATEGORY_SLUGS,
  mapAstroToWpSlug,
  mapWpToAstroSlug,
  filterProductsForCategory,
} from '../src/lib/snapshotGuard.mjs';
import { stripHtml } from '../src/lib/wcMapper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, 'src', 'data', 'snapshot');

const VALIDATE_ONLY = process.argv.includes('--validate-only');

// ── Helpers de filtrado y ordenamiento (idénticos a productFilters.ts y woocommerce.ts) ──
function parsePrice(raw) {
  if (!raw && raw !== 0) return 0;
  const match = String(raw).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function getProductPrice(p) {
  const prices = p?.prices || p;
  return parsePrice(
    prices?.price || prices?.sale_price || prices?.regular_price || p?.price || p?.sale_price || p?.regular_price
  );
}

function getProductRegularPrice(p) {
  const prices = p?.prices || p;
  return parsePrice(prices?.regular_price || p?.regular_price);
}

function variationInStock(v) {
  if (v?.stock_status !== undefined) return v.stock_status !== 'outofstock';
  if (v?.is_in_stock !== undefined) return Boolean(v.is_in_stock);
  return undefined;
}

function isInStock(p) {
  if (p?.stock_status === 'outofstock' || p?.is_in_stock === false) return false;
  const vars = Array.isArray(p?.variations) ? p.variations : [];
  const known = vars.map(variationInStock).filter((s) => s !== undefined);
  if (known.length > 0 && !known.some(Boolean)) return false;
  return true;
}

function isOnSale(p) {
  const regular = getProductRegularPrice(p);
  const price = getProductPrice(p);
  if (regular > price && price > 0) return true;
  const vars = Array.isArray(p?.variations) ? p.variations : [];
  const inStockVars = vars.filter((v) => variationInStock(v) !== false);
  const candidates = inStockVars.length > 0 ? inStockVars : vars;
  if (
    candidates.some((v) => {
      const vPrice = parsePrice(v?.price);
      const vRegular = parsePrice(v?.regular_price);
      const vSale = parsePrice(v?.sale_price);
      return (vRegular > vPrice && vPrice > 0) || (vSale > 0 && vRegular > vSale);
    })
  ) {
    return true;
  }
  return Boolean(p?.on_sale) && regular === 0 && vars.length === 0;
}

function sortNewProductsFirst(products) {
  if (!products || products.length === 0) return [];
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const newProds = [];
  const oldProds = [];
  for (const p of products) {
    const t = p.date_created ? Date.parse(p.date_created) : NaN;
    if (!Number.isNaN(t) && t >= sixtyDaysAgo) {
      newProds.push(p);
    } else {
      oldProds.push(p);
    }
  }
  newProds.sort((a, b) => Date.parse(b.date_created) - Date.parse(a.date_created));
  return [...newProds, ...oldProds];
}

function sortByMenuOrderAndNew(products) {
  const byMenu = [...products].sort((a, b) => {
    const diff = Number(a.menu_order || 0) - Number(b.menu_order || 0);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  return sortNewProductsFirst(byMenu);
}

function toLightweightCatalogProduct(p, includeSearchText = false) {
  const item = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    type: p.type,
    menu_order: Number(p.menu_order || 0),
    price: p.price || p.prices?.price || '0',
    regular_price: p.regular_price || p.prices?.regular_price || '0',
    sale_price: p.sale_price || p.prices?.sale_price || '',
    prices: p.prices,
    images: (p.images || []).slice(0, includeSearchText ? 3 : 2),
    categories: p.categories || [],
    attributes: p.attributes || [],
    tags: p.tags || [],
    stock_status: p.stock_status,
    on_sale: Boolean(p.on_sale),
    featured: Boolean(p.featured),
    date_created: p.date_created || null,
    variation_images_map: p.variation_images_map || null,
  };
  if (includeSearchText) {
    item.short_description = stripHtml(p.short_description, 400);
    item.description = stripHtml(p.description, 800);
  }
  return item;
}

function syncJsonDir(dirPath, expectedFilesMap) {
  fs.mkdirSync(dirPath, { recursive: true });
  // Eliminar JSON obsoletos (incluye productos 404 viejos)
  for (const existing of fs.readdirSync(dirPath)) {
    if (existing.endsWith('.json') && !expectedFilesMap.has(existing)) {
      fs.unlinkSync(path.join(dirPath, existing));
    }
  }
  let written = 0;
  for (const [fileName, content] of expectedFilesMap.entries()) {
    const filePath = path.join(dirPath, fileName);
    if (fs.existsSync(filePath)) {
      try {
        if (fs.readFileSync(filePath, 'utf-8') === content) continue;
      } catch {
        // reescribir
      }
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    written++;
  }
  return written;
}

function main() {
  const startedAt = Date.now();
  const data = validateSnapshot(SNAPSHOT_DIR);
  const { manifest, products, categories, menus, inStockProducts, parentMap } = data;

  if (VALIDATE_ONLY) {
    console.log(
      `[prepare-from-snapshot] ✓ Snapshot válido (${products.length} productos, ${inStockProducts.length} en stock, ${categories.length} categorías).`
    );
    return;
  }

  // 1. Menús → public/data/menus/*.json
  const menusDir = path.join(ROOT, 'public', 'data', 'menus');
  const menuFiles = new Map();
  for (const [slug, items] of Object.entries(menus)) {
    menuFiles.set(
      `${slug}.json`,
      JSON.stringify({ _fetched_at: manifest.generatedAt, _slug: slug, items })
    );
  }
  syncJsonDir(menusDir, menuFiles);

  // 2. Productos individuales → public/data/products/{slug}.json
  // Solo los productos vigentes del snapshot (purga automáticamente los ~11 slugs 404 viejos)
  const productsDir = path.join(ROOT, 'public', 'data', 'products');
  const productFiles = new Map();
  for (const p of products) {
    if (!p?.slug) continue;
    productFiles.set(`${p.slug}.json`, JSON.stringify(p));
  }
  syncJsonDir(productsDir, productFiles);

  // 3. Catálogos por categoría + tienda + sale → public/data/catalog/*.json
  const catalogDir = path.join(ROOT, 'public', 'data', 'catalog');
  const catalogFiles = new Map();

  // 3a. tienda-all.json (índice completo del buscador y tienda)
  const orderedTienda = sortByMenuOrderAndNew(inStockProducts);
  catalogFiles.set(
    'tienda-all.json',
    JSON.stringify(orderedTienda.map((p) => toLightweightCatalogProduct(p, true)))
  );

  // 3b. sale-all.json y sale-home.json (misma lógica que src/pages/sale.astro)
  const allSaleProducts = orderedTienda.filter((p) => isOnSale(p) && isInStock(p));
  const discountRatio = (p) => {
    const regular = getProductRegularPrice(p);
    const price = getProductPrice(p);
    return regular > 0 && price > 0 ? (regular - price) / regular : 0;
  };
  const rankedSale = allSaleProducts
    .map((p, index) => ({ p, index, d: discountRatio(p) }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d || a.index - b.index);

  const typeCount = new Map();
  const diverse = [];
  const leftovers = [];
  for (const x of rankedSale) {
    const type = String(x.p.name || '').trim().split(/\s+/)[0].toLowerCase();
    const n = typeCount.get(type) || 0;
    if (n < 2) {
      typeCount.set(type, n + 1);
      diverse.push(x);
    } else {
      leftovers.push(x);
    }
  }
  const saleHomeProducts = [...diverse, ...leftovers]
    .slice(0, 12)
    .sort((a, b) => b.d - a.d || a.index - b.index)
    .map((x) => toLightweightCatalogProduct(x.p, false));

  catalogFiles.set(
    'sale-all.json',
    JSON.stringify(allSaleProducts.map((p) => toLightweightCatalogProduct(p, false)))
  );
  catalogFiles.set('sale-home.json', JSON.stringify(saleHomeProducts));

  // 3c. Catálogo de cada categoría con productos
  const excludedSet = new Set(EXCLUDED_CATEGORY_SLUGS);
  let catCatalogCount = 0;

  for (const cat of categories) {
    if (!cat?.id || !cat?.slug) continue;
    const astroSlug = mapWpToAstroSlug(cat.slug);
    if (excludedSet.has(cat.slug) || excludedSet.has(astroSlug)) continue;

    const matched = filterProductsForCategory(inStockProducts, cat.id, parentMap);
    if (matched.length === 0) continue;

    const ordered = sortByMenuOrderAndNew(matched);
    const payload = JSON.stringify(ordered.map((p) => toLightweightCatalogProduct(p, false)));

    catalogFiles.set(`${astroSlug}-all.json`, payload);
    const wpSlug = mapAstroToWpSlug(astroSlug);
    if (wpSlug !== astroSlug) {
      catalogFiles.set(`${wpSlug}-all.json`, payload);
    }
    if (cat.slug !== astroSlug && cat.slug !== wpSlug) {
      catalogFiles.set(`${cat.slug}-all.json`, payload);
    }
    catCatalogCount++;
  }

  syncJsonDir(catalogDir, catalogFiles);

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[prepare-from-snapshot] ✓ Listo en ${elapsedMs}ms (offline): ` +
      `${productFiles.size} productos, ${catCatalogCount} categorías (+tienda/sale), ${menuFiles.size} menús.`
  );
}

main();

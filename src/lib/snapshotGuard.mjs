/**
 * Guardia de integridad del snapshot (src/data/snapshot/*.json).
 *
 * Compartida entre:
 * - scripts/prepare-from-snapshot.mjs (corre antes del build y dev)
 * - src/lib/snapshot.ts (lectura durante astro build)
 * - astro.config.mjs (sitemap)
 * - tests/snapshot-guard.test.mjs
 *
 * Falla el build con un mensaje claro si el snapshot falta, está vacío o si una
 * categoría que debería tener productos queda vacía.
 */

import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_SNAPSHOT_FILES = [
  'manifest.json',
  'products.json',
  'categories.json',
  'menus.json',
  'attributes.json',
  'cms.json',
];

export const REQUIRED_MENUS = [
  'menu-principal',
  'atencion-al-cliente',
  'nosotros',
  'legal',
];

export const EXCLUDED_CATEGORY_SLUGS = [
  'bono-regalo-hombre',
  'ideas-regalo-hombre',
  'mas-de-500000',
  'menos-de-200000',
  'menos-de-350000',
  'menos-de-499000',
  'sin-categorizar',
  'uncategorized',
  'outlet-zapatos-ropa',
  'zapatos-maletas-cuero-hombre',
  'zapatos-y-maletas',
];

/**
 * Categorías legítimamente vacías permitidas de forma explícita.
 * Estas NO se publican como páginas vacías en getStaticPaths y NO disparan la guardia.
 * Si una categoría se queda sin inventario temporalmente de forma legítima, agrégala aquí.
 */
export const ALLOWED_EMPTY_CATEGORY_SLUGS = [
  'trajes-blazers-hombre',
  'trajes-y-blazers',
];

/**
 * Categorías núcleo del catálogo que SIEMPRE deben tener al menos 1 producto en stock
 * (salvo que se listen explícitamente en ALLOWED_EMPTY_CATEGORY_SLUGS).
 */
export const CORE_CATEGORY_SLUGS = [
  'zapatos-cuero-hombre',
  'zapatos-cordon-hombre',
  'mocasines-cuero-hombre',
  'botas-cuero-hombre',
  'zapatos-hebilla-hombre',
  'tenis-hombre',
  'ropa-hombre-colombia',
  'camisas-algodon-hombre',
  'chaquetas-hombre',
  'sueteres-chalecos-hombre',
  'polos-camisetas-hombre',
  'medias-hombre',
  'maletas-morrales-cuero-hombre',
  'accesorios-hombre',
  'billeteras-cuero-hombre',
  'cinturones',
  'collares-cuero-perro',
];

export const ASTRO_TO_WP_SLUG_MAP = {
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
  'limpieza-cuidado-zapatos': 'limpieza',
};

export function mapAstroToWpSlug(slug) {
  return ASTRO_TO_WP_SLUG_MAP[slug] || slug;
}

export function mapWpToAstroSlug(wpSlug) {
  const entry = Object.entries(ASTRO_TO_WP_SLUG_MAP).find(([, wp]) => wp === wpSlug);
  return entry ? entry[0] : wpSlug;
}

export function isValidDisplayProduct(p) {
  if (!p || !p.id || !p.slug) return false;
  const price = Number(p.prices?.price ?? p.price ?? 0);
  return Number.isFinite(price) && price > 0;
}

export function isProductInStock(p) {
  if (!p) return false;
  if (p.stock_status === 'outofstock' || p.is_in_stock === false) return false;
  if (p.type === 'variable') {
    const vars = Array.isArray(p.variations) ? p.variations : [];
    const known = vars
      .map((v) =>
        v?.stock_status !== undefined
          ? v.stock_status !== 'outofstock'
          : v?.is_in_stock !== undefined
            ? Boolean(v.is_in_stock)
            : undefined
      )
      .filter((s) => s !== undefined);
    if (known.length > 0 && !known.some(Boolean)) return false;
  }
  return true;
}

/** Construye mapa childId -> parentId para comprobar pertenencia jerárquica. */
export function buildCategoryParentMap(categories) {
  const parentMap = new Map();
  if (!Array.isArray(categories)) return parentMap;
  for (const c of categories) {
    if (c && c.id && c.parent && Number(c.parent) !== 0) {
      parentMap.set(String(c.id), String(c.parent));
    }
  }
  return parentMap;
}

/** Comprueba si `catId` es igual a `targetId` o desciende de `targetId` en la jerarquía. */
export function categoryMatchesTarget(catId, targetId, parentMap) {
  let current = String(catId);
  const target = String(targetId);
  const visited = new Set();
  while (current && !visited.has(current)) {
    if (current === target) return true;
    visited.add(current);
    current = parentMap.get(current) || '';
  }
  return false;
}

export function filterProductsForCategory(products, categoryId, parentMap) {
  const targetId = String(categoryId);
  return products.filter((p) => {
    const cats = Array.isArray(p?.categories) ? p.categories : [];
    return cats.some((c) => {
      const cid = typeof c === 'object' ? c?.id : c;
      if (cid === undefined || cid === null) return false;
      return categoryMatchesTarget(cid, targetId, parentMap);
    });
  });
}

function readJsonStrict(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[Snapshot Guard] Falta el archivo obligatorio del snapshot: ${label} (${filePath}). Ejecuta "npm run snapshot" antes de compilar.`
    );
  }
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    throw new Error(
      `[Snapshot Guard] El archivo del snapshot está vacío: ${label} (${filePath}). Ejecuta "npm run snapshot".`
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[Snapshot Guard] JSON inválido en ${label} (${filePath}): ${err.message}`
    );
  }
}

/**
 * Valida la integridad completa de los datos del snapshot ya cargados en memoria
 * ({ 'manifest.json': ..., 'products.json': ..., ... }).
 * Lanza Error descriptivo si cualquier condición crítica falla.
 */
export function validateSnapshotData(
  loaded,
  {
    allowedEmptySlugs = ALLOWED_EMPTY_CATEGORY_SLUGS,
    coreCategorySlugs = CORE_CATEGORY_SLUGS,
    minInStockProducts = 1,
  } = {}
) {
  if (!loaded || typeof loaded !== 'object') {
    throw new Error('[Snapshot Guard] Los datos del snapshot son inválidos.');
  }

  const manifest = loaded['manifest.json'];
  const products = loaded['products.json'];
  const categories = loaded['categories.json'];
  const menus = loaded['menus.json'];
  const attributes = loaded['attributes.json'];
  const cms = loaded['cms.json'];

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(
      '[Snapshot Guard] products.json está vacío. Se aborta el build para evitar publicar un sitio sin productos.'
    );
  }

  const inStockProducts = products.filter(
    (p) => isValidDisplayProduct(p) && isProductInStock(p)
  );
  if (inStockProducts.length < minInStockProducts) {
    throw new Error(
      `[Snapshot Guard] Solo hay ${inStockProducts.length} productos en stock con precio válido (mínimo requerido: ${minInStockProducts}). Se aborta el build.`
    );
  }

  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error(
      '[Snapshot Guard] categories.json está vacío. Se aborta el build para evitar publicar categorías en blanco.'
    );
  }

  if (!menus || typeof menus !== 'object') {
    throw new Error('[Snapshot Guard] menus.json no contiene un objeto válido.');
  }

  for (const menuSlug of REQUIRED_MENUS) {
    const items = menus[menuSlug];
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(
        `[Snapshot Guard] El menú obligatorio "${menuSlug}" está vacío en menus.json. Se aborta el build.`
      );
    }
  }

  if (!Array.isArray(attributes)) {
    throw new Error('[Snapshot Guard] attributes.json debe ser un arreglo.');
  }

  // Verificar conteo de productos por categoría (incluyendo subcategorías)
  const parentMap = buildCategoryParentMap(categories);
  const categoryProductCounts = new Map();
  const catByAstroSlug = new Map();
  const catByWpSlug = new Map();

  for (const cat of categories) {
    if (!cat || !cat.id) continue;
    const astroSlug = mapWpToAstroSlug(cat.slug);
    catByAstroSlug.set(astroSlug, cat);
    catByWpSlug.set(cat.slug, cat);
    const matched = filterProductsForCategory(inStockProducts, cat.id, parentMap);
    categoryProductCounts.set(cat.id, matched.length);
  }

  const allowSet = new Set(allowedEmptySlugs);
  const excludedSet = new Set(EXCLUDED_CATEGORY_SLUGS);
  const emptyCoreCategories = [];

  for (const slug of coreCategorySlugs) {
    if (excludedSet.has(slug) || allowSet.has(slug)) continue;
    const wpSlug = mapAstroToWpSlug(slug);
    const cat = catByAstroSlug.get(slug) || catByWpSlug.get(slug) || catByWpSlug.get(wpSlug);
    if (!cat) {
      emptyCoreCategories.push(`${slug} (no existe en categories.json)`);
      continue;
    }
    const count = categoryProductCounts.get(cat.id) || 0;
    if (count === 0) {
      emptyCoreCategories.push(`${slug} (id=${cat.id}, 0 productos en stock)`);
    }
  }

  if (emptyCoreCategories.length > 0) {
    throw new Error(
      `[Snapshot Guard] Las siguientes categorías obligatorias quedaron sin productos en stock: ${emptyCoreCategories.join(', ')}. ` +
        'Si alguna está vacía legítimamente, agrégala a ALLOWED_EMPTY_CATEGORY_SLUGS en src/lib/snapshotGuard.mjs.'
    );
  }

  return {
    manifest,
    products,
    categories,
    menus,
    attributes,
    cms,
    inStockProducts,
    parentMap,
    categoryProductCounts,
  };
}

/**
 * Valida la integridad completa del snapshot en `snapshotDir`.
 * Lanza Error descriptivo si cualquier condición crítica falla.
 */
export function validateSnapshot(
  snapshotDir = path.join(process.cwd(), 'src', 'data', 'snapshot'),
  opts = {}
) {
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(
      `[Snapshot Guard] No existe el directorio de snapshot (${snapshotDir}). Ejecuta "npm run snapshot" para generar el snapshot antes del build.`
    );
  }

  const loaded = {};
  for (const fileName of REQUIRED_SNAPSHOT_FILES) {
    loaded[fileName] = readJsonStrict(path.join(snapshotDir, fileName), fileName);
  }

  return validateSnapshotData(loaded, opts);
}

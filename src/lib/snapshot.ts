/**
 * src/lib/snapshot.ts
 *
 * Lectura 100% offline del snapshot commiteado en src/data/snapshot/*.json.
 * - Todos los JSON del snapshot se importan estáticamente para que estén
 *   disponibles tanto en SSG (build-time) como en Vercel Serverless Functions
 *   (rutas prerender=false como /api/products, /blog, /buscar, /carrito, /checkout)
 *   sin hacer fetch HTTP ni leer del sistema de archivos en runtime.
 * - Los datos se validan una sola vez via validateSnapshotData() con caché en memoria.
 */

import manifestJson from '../data/snapshot/manifest.json';
import productsJson from '../data/snapshot/products.json';
import categoriesJson from '../data/snapshot/categories.json';
import menusJson from '../data/snapshot/menus.json';
import attributesJson from '../data/snapshot/attributes.json';
import cmsJson from '../data/snapshot/cms.json';
import {
  validateSnapshotData,
  EXCLUDED_CATEGORY_SLUGS,
  mapAstroToWpSlug,
  mapWpToAstroSlug,
  filterProductsForCategory,
  isValidDisplayProduct,
  isProductInStock,
} from './snapshotGuard.mjs';
import { STRICT_CATEGORIES } from './woocommerce';
import { isOnSale, isInStock, getProductPrice } from './productFilters';

let cachedSnapshot: ReturnType<typeof validateSnapshotData> | null = null;

export function getSnapshotData() {
  if (!cachedSnapshot) {
    cachedSnapshot = validateSnapshotData({
      'manifest.json': manifestJson,
      'products.json': productsJson,
      'categories.json': categoriesJson,
      'menus.json': menusJson,
      'attributes.json': attributesJson,
      'cms.json': cmsJson,
    });
  }
  return cachedSnapshot;
}

/** Menú desde snapshot commiteado (bundled en SSG y SSR; nunca hace fetch HTTP). */
export function getSnapshotMenu(slug: string): any[] {
  const menus = menusJson as Record<string, any[]>;
  if (Array.isArray(menus?.[slug]) && menus[slug].length > 0) {
    return menus[slug];
  }
  if (slug === 'menu-principal' && Array.isArray(menus?.['principal']) && menus['principal'].length > 0) {
    return menus['principal'];
  }
  return [];
}

/** Datos CMS desde snapshot commiteado (bundled en SSG y SSR). */
export function getSnapshotCms(): any {
  return cmsJson || {};
}

export function getSnapshotPageById(id: number | string): any | null {
  const cms = getSnapshotCms();
  return cms?.pages?.[String(id)] || null;
}

export function getSnapshotHomePage(): any | null {
  return getSnapshotCms()?.homePage || null;
}

export function getSnapshotHomeBannerRaw(): any | null {
  return getSnapshotCms()?.homeBannerRaw || null;
}

export function getSnapshotHomeCategories(): any | null {
  return getSnapshotCms()?.homeCategories || null;
}

export function getSnapshotHeroSlides(): { slides: any[]; slots: number } {
  const h = getSnapshotCms()?.heroSlides;
  if (h && Array.isArray(h.slides)) return h;
  return { slides: [], slots: 0 };
}

export function getSnapshotLookOfTheWeek(): any | null {
  return getSnapshotCms()?.lookOfTheWeek || null;
}

export function getSnapshotBlogPosts(): any[] {
  const posts = getSnapshotCms()?.blogPosts;
  return Array.isArray(posts) ? posts : [];
}

export function getSnapshotBeholdPosts(): any[] {
  const posts = getSnapshotCms()?.beholdPosts;
  return Array.isArray(posts) ? posts : [];
}

function sortNewProductsFirst(products: any[]): any[] {
  if (!products || products.length === 0) return [];
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const newProds: any[] = [];
  const oldProds: any[] = [];
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

function sortList(products: any[], orderBy = 'menu_order', order = 'asc'): any[] {
  const dir = order === 'desc' ? -1 : 1;
  const copy = [...products];

  copy.sort((a, b) => {
    if (orderBy === 'price') {
      return (getProductPrice(a) - getProductPrice(b)) * dir;
    }
    if (orderBy === 'date') {
      return ((Date.parse(a.date_created || '') || 0) - (Date.parse(b.date_created || '') || 0)) * dir;
    }
    if (orderBy === 'modified') {
      return (
        ((Date.parse(a.date_modified || a.date_created || '') || 0) -
          (Date.parse(b.date_modified || b.date_created || '') || 0)) *
        dir
      );
    }
    if (orderBy === 'popularity') {
      return (Number(a.total_sales || 0) - Number(b.total_sales || 0)) * dir;
    }
    // menu_order por defecto
    const diff = (Number(a.menu_order || 0) - Number(b.menu_order || 0)) * dir;
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return copy;
}

export function toLightweightProduct(p: any): any {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    type: p.type,
    menu_order: Number(p.menu_order || 0),
    price: p.price || p.prices?.price || '0',
    regular_price: p.regular_price || p.prices?.regular_price || '0',
    sale_price: p.sale_price || p.prices?.sale_price || '',
    prices: p.prices,
    images: (p.images || []).slice(0, 2),
    categories: p.categories || [],
    attributes: p.attributes || [],
    tags: p.tags || [],
    stock_status: p.stock_status,
    on_sale: Boolean(p.on_sale),
    featured: Boolean(p.featured),
    date_created: p.date_created || null,
    variation_images_map: p.variation_images_map || null,
  };
}

export function getSnapshotAllPublishedProducts(): any[] {
  return getSnapshotData().products;
}

export function getSnapshotAllInStockProducts(): any[] {
  return getSnapshotData().inStockProducts;
}

export function getSnapshotProductBySlug(slug: string): any | null {
  const { products } = getSnapshotData();
  return products.find((p: any) => p.slug === slug) || null;
}

export function getSnapshotProductById(id: number | string): any | null {
  const numId = Number(id);
  const { products } = getSnapshotData();
  return products.find((p: any) => Number(p.id) === numId) || null;
}

export function getSnapshotProductsPool(limit = 60): any[] {
  const { inStockProducts } = getSnapshotData();
  return inStockProducts.slice(0, limit);
}

export function getSnapshotAllProducts(
  perPage = 16,
  page = 1,
  orderBy = 'popularity',
  order = 'desc',
  onSale = false,
  maxPrice?: string
): any[] {
  let list = [...getSnapshotData().inStockProducts];

  if (onSale) {
    list = list.filter((p) => p.on_sale || isOnSale(p));
  }
  if (maxPrice) {
    const max = Number(maxPrice);
    if (Number.isFinite(max) && max > 0) {
      list = list.filter((p) => getProductPrice(p) <= max);
    }
  }

  const ordered = sortNewProductsFirst(sortList(list, orderBy, order));
  const start = Math.max(0, (page - 1) * perPage);
  return ordered.slice(start, start + perPage).map(toLightweightProduct);
}

export function getSnapshotProductsByCategory(
  categoryIdOrSlug: string | number,
  perPage = 100,
  page = 1,
  orderBy = 'menu_order',
  order = 'asc',
  onSale = false,
  maxPrice?: string
): any[] {
  const { inStockProducts, parentMap } = getSnapshotData();
  const rawTokens = String(categoryIdOrSlug)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ids: string[] = [];
  for (const token of rawTokens) {
    if (!Number.isNaN(Number(token))) {
      ids.push(token);
    } else {
      const cat = getSnapshotCategoryBySlug(token);
      if (cat?.id) ids.push(String(cat.id));
    }
  }

  const seen = new Set<number>();
  let matched: any[] = [];
  for (const id of ids) {
    for (const p of filterProductsForCategory(inStockProducts, id, parentMap)) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        matched.push(p);
      }
    }
  }

  if (onSale) {
    matched = matched.filter((p) => p.on_sale || isOnSale(p));
  }
  if (maxPrice) {
    const max = Number(maxPrice);
    if (Number.isFinite(max) && max > 0) {
      matched = matched.filter((p) => getProductPrice(p) <= max);
    }
  }

  const ordered = sortNewProductsFirst(sortList(matched, orderBy, order));
  const start = Math.max(0, (page - 1) * perPage);
  return ordered.slice(start, start + perPage).map(toLightweightProduct);
}

export function getSnapshotCategories(): any[] {
  return getSnapshotData().categories;
}

const strictById = new Map<number, (typeof STRICT_CATEGORIES)[number]>(
  STRICT_CATEGORIES.map((c) => [c.id, c])
);

export function getSnapshotCategoryBySlug(slug: string): any | null {
  const { categories } = getSnapshotData();
  const wpSlug = mapAstroToWpSlug(slug);

  const found =
    categories.find((c: any) => c.slug === wpSlug || c.slug === slug) ||
    categories.find((c: any) => mapWpToAstroSlug(c.slug) === slug);

  if (found) {
    const strict = strictById.get(found.id);
    return {
      ...found,
      slug,
      name: strict?.name || found.name,
      description: found.description || strict?.description || '',
      image: found.image || (strict?.image ? { src: strict.image } : null),
    };
  }

  const strictMatch = STRICT_CATEGORIES.find((c) => c.slug === slug || c.slug === wpSlug);
  if (strictMatch) {
    return {
      id: strictMatch.id,
      name: strictMatch.name,
      slug: strictMatch.slug,
      parent: 0,
      description: strictMatch.description || '',
      image: strictMatch.image ? { src: strictMatch.image } : null,
      desktop_banner: strictMatch.image || null,
      mobile_banner: strictMatch.image || null,
      meta_data: [],
    };
  }

  return null;
}

export function getSnapshotCategoryById(id: number): any | null {
  const { categories } = getSnapshotData();
  return categories.find((c: any) => Number(c.id) === Number(id)) || null;
}

export function getSnapshotChildCategories(parentId: number): any[] {
  const { categories, categoryProductCounts } = getSnapshotData();
  const excludedSet = new Set(EXCLUDED_CATEGORY_SLUGS);

  return categories
    .filter((c: any) => {
      if (Number(c.parent) !== Number(parentId)) return false;
      const astroSlug = mapWpToAstroSlug(c.slug);
      if (excludedSet.has(c.slug) || excludedSet.has(astroSlug)) return false;
      return (categoryProductCounts.get(c.id) || 0) > 0;
    })
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: mapWpToAstroSlug(c.slug),
      count: categoryProductCounts.get(c.id) || c.count || 0,
      image: c.image ? { src: c.image.src, alt: c.image.alt || c.name } : null,
    }));
}

export function getSnapshotCategoryTree(): any[] {
  const { categories, categoryProductCounts } = getSnapshotData();
  const excludedSet = new Set(EXCLUDED_CATEGORY_SLUGS);

  const nonEmpty = categories.filter((c: any) => {
    const astroSlug = mapWpToAstroSlug(c.slug);
    if (excludedSet.has(c.slug) || excludedSet.has(astroSlug)) return false;
    return (categoryProductCounts.get(c.id) || 0) > 0;
  });

  const roots = nonEmpty.filter((c: any) => Number(c.parent) === 0);
  return roots.map((root: any) => ({
    id: root.id,
    name: root.name,
    slug: mapWpToAstroSlug(root.slug),
    children: nonEmpty
      .filter((c: any) => Number(c.parent) === Number(root.id))
      .map((child: any) => ({
        id: child.id,
        name: child.name,
        slug: mapWpToAstroSlug(child.slug),
      })),
  }));
}

/**
 * Categorías publicables para getStaticPaths() de src/pages/categoria/[slug].astro:
 * excluye EXCLUDED_CATEGORY_SLUGS y excluye categorías sin productos (nunca genera páginas vacías).
 */
export function getSnapshotPublishableCategories(): any[] {
  const { categories, categoryProductCounts } = getSnapshotData();
  const excludedSet = new Set(EXCLUDED_CATEGORY_SLUGS);
  const seenSlugs = new Set<string>();
  const publishable: any[] = [];

  for (const wooCat of categories) {
    if (!wooCat?.id || !wooCat?.slug) continue;
    const strictCat = strictById.get(wooCat.id);
    const astroSlug = strictCat ? strictCat.slug : mapWpToAstroSlug(wooCat.slug);

    if (excludedSet.has(wooCat.slug) || excludedSet.has(astroSlug)) continue;

    const count = categoryProductCounts.get(wooCat.id) || 0;
    if (count === 0) continue;

    if (seenSlugs.has(astroSlug)) continue;
    seenSlugs.add(astroSlug);

    publishable.push({
      id: wooCat.id,
      slug: astroSlug,
      name: strictCat?.name || wooCat.name,
      description: wooCat.description || strictCat?.description || '',
      image: wooCat.image?.src || strictCat?.image || '',
      productCount: count,
    });
  }

  if (publishable.length === 0) {
    throw new Error('[Snapshot Guard] Ninguna categoría tiene productos publicables en el snapshot.');
  }

  return publishable;
}

export function getSnapshotAttributes(): any[] {
  return getSnapshotData().attributes;
}

export function getSnapshotAttributeTerms(attributeId: number | string): any[] {
  const attr = getSnapshotData().attributes.find((a: any) => Number(a.id) === Number(attributeId));
  return Array.isArray(attr?.terms) ? attr.terms : [];
}

/** Productos en SALE (misma lógica exacta de src/pages/sale.astro). */
export function getSnapshotSaleProducts(): any[] {
  const { inStockProducts } = getSnapshotData();
  const ordered = sortNewProductsFirst(sortList(inStockProducts, 'menu_order', 'asc'));
  return ordered.filter((p) => isOnSale(p) && isInStock(p));
}

export { isValidDisplayProduct, isProductInStock };

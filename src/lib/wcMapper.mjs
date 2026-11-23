/**
 * Mapeo compartido de productos WooCommerce v3 → formato normalizado de tienda.
 * Usado por scripts/snapshot-wc.mjs para producir exactamente la misma estructura
 * que espera el frontend (ProductDetail, ProductCard, FilteredProductList, productFilters).
 */

export function normalizeSlug(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

export function parseVariationImageIds(metaVal) {
  if (!metaVal) return [];
  if (typeof metaVal === 'string') {
    if (metaVal.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(metaVal);
        return Array.isArray(parsed)
          ? parsed.map((item) => (item?.id?.toString() || String(item)).trim()).filter(Boolean)
          : [];
      } catch {
        return [];
      }
    }
    return metaVal
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(metaVal)) {
    return metaVal.map((item) => (item?.id?.toString() || String(item)).trim()).filter(Boolean);
  }
  return [];
}

function cleanDescription(html) {
  if (!html) return '';
  let cleaned = String(html);
  cleaned = cleaned.replace(
    /https:\/\/tienda\.winstonandharrystore\.com/g,
    'https://www.winstonandharrystore.com'
  );
  cleaned = cleaned.replace(/\/product\/([^/]+)/g, '/productos/$1');
  cleaned = cleaned.replace(/\/product-category\/([^/]+)/g, '/categoria/$1');
  return cleaned;
}

function isForeignImage(productSlug, filename) {
  if (!filename) return false;
  const slug = String(productSlug || '').toLowerCase();
  const lower = String(filename).toLowerCase();
  const knownForeignSlugs = [
    'bucaramanga',
    'loaiza',
    'bath',
    'bradford',
    'buckingham',
    'wessex',
    'lincoln',
  ];
  const foreign = knownForeignSlugs.find((s) => lower.includes(s) && slug !== s);
  if (foreign && !slug.includes(foreign)) return true;
  return false;
}

function findColorAttr(attributes) {
  if (!Array.isArray(attributes)) return null;
  return attributes.find((a) => {
    const n = String(a?.name || '').toLowerCase();
    const s = String(a?.slug || '').toLowerCase();
    const id = String(a?.id || '').toLowerCase();
    return (
      n.includes('color') ||
      s.includes('color') ||
      n.includes('selecciona-el') ||
      s.includes('selecciona-el') ||
      id.includes('color') ||
      a?.name === 'Pa_selecciona-el-color'
    );
  });
}

function buildVariationImagesMap(p) {
  if (p.variation_images_map) return p.variation_images_map;
  if (!Array.isArray(p.variations_data) || p.variations_data.length === 0) return null;

  const imgMap = {};
  const slug = p.slug || '';

  // 1. Imágenes principales de las variaciones
  for (const v of p.variations_data) {
    const colorAttr = findColorAttr(v.attributes);
    if (colorAttr && (colorAttr.option || colorAttr.value) && v.image?.src) {
      const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
      const colorKey = normalizeSlug(colorValue) || colorValue;
      if (!imgMap[colorKey]) imgMap[colorKey] = [];

      if (
        !imgMap[colorKey].some((img) => img.src === v.image.src) &&
        !isForeignImage(slug, v.image.src)
      ) {
        imgMap[colorKey].push({
          id: v.image.id || 0,
          src: v.image.src,
          alt: v.image.alt || v.image.name || '',
          name: v.image.name || '',
        });
      }
    }
  }

  // 2. gallery_image_ids nativos de WooCommerce
  const productImagesById = {};
  for (const img of p.images || []) {
    if (img?.id) productImagesById[img.id] = img;
  }

  for (const v of p.variations_data) {
    if (!Array.isArray(v.gallery_image_ids) || v.gallery_image_ids.length === 0) continue;
    const colorAttr = findColorAttr(v.attributes);
    if (!colorAttr || !(colorAttr.option || colorAttr.value)) continue;

    const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
    const colorKey = normalizeSlug(colorValue) || colorValue;
    if (!imgMap[colorKey]) imgMap[colorKey] = [];

    for (const id of v.gallery_image_ids) {
      const img = productImagesById[id];
      if (img?.src && !imgMap[colorKey].some((i) => i.src === img.src)) {
        if (!isForeignImage(slug, img.src)) {
          imgMap[colorKey].push({
            id: img.id,
            src: img.src,
            alt: img.alt || img.name || p.name,
            name: img.name || '',
          });
        }
      } else if (!img && p.wpc_resolved_media?.[String(id)]) {
        const url = p.wpc_resolved_media[String(id)];
        if (url && !imgMap[colorKey].some((i) => i.src === url) && !isForeignImage(slug, url)) {
          imgMap[colorKey].push({ id, src: url, alt: p.name });
        }
      }
    }
  }

  // 3. Imágenes adicionales de WPC / WoodMart
  for (const v of p.variations_data) {
    const wpcMeta = v.meta_data?.find(
      (m) =>
        (m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data') && m.value
    );
    if (!wpcMeta?.value || !p.wpc_resolved_media) continue;

    const colorAttr = findColorAttr(v.attributes);
    if (!colorAttr || !(colorAttr.option || colorAttr.value)) continue;

    const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
    const colorKey = normalizeSlug(colorValue) || colorValue;
    if (!imgMap[colorKey]) imgMap[colorKey] = [];

    const ids = parseVariationImageIds(wpcMeta.value);
    for (const id of ids) {
      const url = p.wpc_resolved_media[id.trim()];
      if (url && !imgMap[colorKey].some((img) => img.src === url) && !isForeignImage(slug, url)) {
        imgMap[colorKey].push({ id: parseInt(id, 10) || 0, src: url, alt: p.name });
      }
    }
  }

  return Object.keys(imgMap).length > 0 ? imgMap : null;
}

/**
 * Mapea un producto de WooCommerce REST API v3 (con variations_data y wpc_resolved_media opcionales)
 * al formato completo que consumen las páginas y componentes de Astro/React.
 */
export function mapV3ProductToSnapshot(p) {
  if (!p || !p.id) return null;

  let rawPrice = parseFloat(p.price || p.regular_price || '0');
  if (rawPrice === 0 && Array.isArray(p.variations_data) && p.variations_data.length > 0) {
    const prices = p.variations_data
      .map((v) => parseFloat(v.price || '0'))
      .filter((pr) => pr > 0);
    if (prices.length > 0) rawPrice = Math.min(...prices);
  }
  const inclusivePrice = Math.round(rawPrice || 0);

  const regularPriceStr = p.regular_price
    ? Math.round(parseFloat(p.regular_price)).toString()
    : p.on_sale
      ? ''
      : (inclusivePrice || 0).toString();
  const salePriceStr = p.sale_price ? Math.round(parseFloat(p.sale_price)).toString() : '';

  const seoMetaKeys = new Set([
    'rank_math_title',
    'rank_math_description',
    'rank_math_focus_keyword',
  ]);
  const compactMetaData = Array.isArray(p.meta_data)
    ? p.meta_data
        .filter((m) => m && seoMetaKeys.has(m.key) && m.value)
        .map((m) => ({ key: m.key, value: m.value }))
    : [];

  const mapped = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    permalink: p.permalink,
    sku: p.sku || '',
    type: p.type,
    status: p.status,
    menu_order: Number(p.menu_order || 0),
    total_sales: Number(p.total_sales || 0),
    date_created: p.date_created || null,
    date_modified: p.date_modified || p.date_created || null,
    rating_count: Number(p.rating_count || 0),
    average_rating: p.average_rating || '0',
    description: cleanDescription(p.description),
    short_description: cleanDescription(p.short_description),
    price: (inclusivePrice || 0).toString(),
    regular_price: regularPriceStr,
    sale_price: salePriceStr,
    prices: {
      price: (inclusivePrice || 0).toString(),
      regular_price: regularPriceStr,
      sale_price: salePriceStr,
      currency_code: 'COP',
      currency_symbol: '$',
      currency_minor_unit: 0,
      currency_prefix: '$',
      price_range: null,
    },
    images: (p.images || []).map((img) => ({
      id: img.id || 0,
      src: img.src || 'https://via.placeholder.com/600x600?text=Sin+Imagen',
      alt: img.alt || p.name,
      name: img.name || '',
    })),
    attributes: (p.attributes || []).map((attr) => ({
      id: attr.id,
      name: attr.name,
      slug: attr.slug,
      terms:
        attr.options?.map((opt, idx) => ({
          id: idx,
          name: opt,
          slug: normalizeSlug(opt),
        })) || [],
    })),
    categories:
      p.categories?.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
      })) || [],
    category_ids: p.categories?.map((cat) => cat.id) || [],
    tags:
      p.tags?.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
      })) || [],
    variation_ids: Array.isArray(p.variations) ? p.variations : [],
    on_sale: Boolean(p.on_sale),
    featured: Boolean(p.featured),
    upsell_ids: Array.isArray(p.upsell_ids) ? p.upsell_ids : [],
    cross_sell_ids: Array.isArray(p.cross_sell_ids) ? p.cross_sell_ids : [],
    related_ids: Array.isArray(p.related_ids) ? p.related_ids : [],
    variations: Array.isArray(p.variations_data)
      ? p.variations_data.map((v) => {
          const vRawPrice = parseFloat(v.price || v.regular_price || '0');
          const vIncPrice = Math.round(vRawPrice || 0);
          const vRegRaw = parseFloat(v.regular_price || v.price || '0');
          const vIncRegPrice = Math.round(vRegRaw || 0);
          const vSaleRaw = v.sale_price ? Math.round(parseFloat(v.sale_price)).toString() : '';

          return {
            id: v.id,
            image: v.image?.src
              ? {
                  id: v.image.id || 0,
                  src: v.image.src,
                  alt: v.image.alt || v.image.name || p.name,
                  name: v.image.name || '',
                }
              : null,
            manage_stock: Boolean(v.manage_stock),
            stock_quantity: v.stock_quantity ?? null,
            sale_price: vSaleRaw,
            price: vIncPrice > 0 ? vIncPrice.toString() : (inclusivePrice || 0).toString(),
            regular_price:
              vIncRegPrice > 0
                ? vIncRegPrice.toString()
                : (regularPriceStr || vIncPrice || 0).toString(),
            stock_status: v.stock_status || 'instock',
            attributes: (v.attributes || []).map((a) => ({
              id: a.id,
              name: a.name,
              slug: a.slug,
              option: a.option || a.value || '',
              value: a.value || a.option || '',
            })),
          };
        })
      : [],
    variation_images_map: buildVariationImagesMap(p),
    stock_status: p.stock_status || 'instock',
    manage_stock: Boolean(p.manage_stock),
    stock_quantity: p.stock_quantity ?? null,
    meta_data: compactMetaData,
    yoast_head_json: p.yoast_head_json || p.rank_math_seo || null,
    rank_math_seo: p.rank_math_seo || null,
  };

  // Misma regla que mapV3ToStore en src/lib/woocommerce.ts:
  // El precio "desde" y su precio normal salen de la MISMA variación.
  if (p.type === 'variable' && Array.isArray(p.variations_data) && p.variations_data.length > 0) {
    const parsed = p.variations_data
      .map((v) => {
        const price = parseFloat(v.price || '0');
        const regular = parseFloat(v.regular_price || v.price || '0');
        return {
          price,
          regular: regular > 0 ? regular : price,
          inStock: (v.stock_status || 'instock') === 'instock',
        };
      })
      .filter((v) => v.price > 0);

    const inStock = parsed.filter((v) => v.inStock);
    const candidates = inStock.length > 0 ? inStock : parsed;

    if (candidates.length > 0) {
      const byPrice = (a, b) => a.price - b.price;
      const cheapest = [...candidates].sort(byPrice)[0];
      const discounted = candidates.filter((v) => v.regular > v.price).sort(byPrice)[0];
      const rep = cheapest.regular > cheapest.price || !discounted ? cheapest : discounted;

      mapped.prices.regular_price = Math.round(rep.regular).toString();
      mapped.prices.price = Math.round(rep.price).toString();
      mapped.regular_price = mapped.prices.regular_price;
      mapped.price = mapped.prices.price;
    }
  }

  return mapped;
}

/** Quita etiquetas HTML y acota la longitud para el índice de búsqueda. */
export function stripHtml(html, max) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

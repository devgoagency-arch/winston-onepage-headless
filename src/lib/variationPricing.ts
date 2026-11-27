/**
 * src/lib/variationPricing.ts
 *
 * Lógica pura (sin dependencias de React) para calcular precios "Desde",
 * descuentos y tallas/colores con stock real a partir de las variaciones.
 */

export interface FromPriceResult {
  price: number;
  regular: number;
  discountPct: number;
  hasRange: boolean;
}

/** Normaliza un valor o nombre de atributo al mismo formato slug usado en filtros/terms.slug. */
export function normalizeVariationSlug(text: unknown): string {
  if (text === undefined || text === null) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

/** Extrae el valor numérico de un precio de WooCommerce (string o número). */
export function parsePrice(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const match = String(raw).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

/** Obtiene el arreglo de objetos de variación del producto, si existen. */
function getProductVariations(product: any): any[] {
  if (
    Array.isArray(product?.variations) &&
    product.variations.length > 0 &&
    typeof product.variations[0] === 'object' &&
    product.variations[0] !== null
  ) {
    return product.variations;
  }
  if (Array.isArray(product?.variations_data) && product.variations_data.length > 0) {
    return product.variations_data;
  }
  return [];
}

/** True/false si la variación informa su stock; undefined si no trae ese dato. */
function variationInStock(v: any): boolean | undefined {
  if (v?.stock_status !== undefined && v.stock_status !== null && v.stock_status !== '') {
    return v.stock_status !== 'outofstock';
  }
  if (v?.is_in_stock !== undefined && v.is_in_stock !== null) {
    return Boolean(v.is_in_stock);
  }
  return undefined;
}

function isColorAttribute(a: any): boolean {
  const n = String(a?.name || '').toLowerCase();
  const s = String(a?.slug || '').toLowerCase();
  const id = String(a?.id || '').toLowerCase();
  return (
    n.includes('color') ||
    s.includes('color') ||
    n.includes('selecciona-el-color') ||
    id.includes('color')
  );
}

function isSizeAttribute(a: any): boolean {
  const n = String(a?.name || '').toLowerCase();
  const s = String(a?.slug || '').toLowerCase();
  const id = String(a?.id || '').toLowerCase();
  return (
    n.includes('talla') ||
    n.includes('tamaño') ||
    n.includes('tamano') ||
    n.includes('size') ||
    n.includes('numero') ||
    n.includes('nmero') ||
    n.includes('selecciona-una-talla') ||
    s.includes('talla') ||
    s.includes('size') ||
    id.includes('talla') ||
    id.includes('size')
  );
}

/**
 * Devuelve las variaciones con stock (stock_status !== 'outofstock' o is_in_stock === true).
 * Si ninguna variación trae información de stock, considera todas las variaciones.
 */
export function getInStockVariations(product: any): any[] {
  const vars = getProductVariations(product);
  if (vars.length === 0) return [];

  const hasStockData = vars.some((v) => variationInStock(v) !== undefined);
  if (!hasStockData) return vars;

  return vars.filter((v) => variationInStock(v) === true);
}

/** Porcentaje de descuento redondeado entre price y regular, o 0 si no hay descuento. */
export function getDiscountPct(price: number, regular: number): number {
  const p = Number(price) || 0;
  const r = Number(regular) || 0;
  if (r <= 0 || p <= 0 || r <= p) return 0;
  return Math.round(((r - p) / r) * 100);
}

/**
 * Calcula el precio "Desde" usando la variación MÁS BARATA CON STOCK.
 * Si no hay variaciones con stock o el producto no es variable, usa prices del padre.
 * hasRange = true solo si las variaciones con stock tienen precios distintos entre sí.
 */
export function getFromPrice(product: any): FromPriceResult {
  const parentPrice = parsePrice(
    product?.prices?.price ||
      product?.prices?.sale_price ||
      product?.prices?.regular_price ||
      product?.price ||
      product?.sale_price ||
      product?.regular_price
  );
  const parentRegularRaw = parsePrice(
    product?.prices?.regular_price || product?.regular_price
  );
  const parentRegular = parentRegularRaw > 0 ? parentRegularRaw : parentPrice;

  const isSimple = product?.type === 'simple';
  const inStock = isSimple ? [] : getInStockVariations(product);

  const pricedVars = inStock
    .map((v) => {
      const price = parsePrice(v?.price || v?.sale_price || v?.regular_price);
      const regularRaw = parsePrice(v?.regular_price);
      const regular = regularRaw > 0 ? regularRaw : price;
      return { price, regular };
    })
    .filter((v) => v.price > 0);

  if (pricedVars.length > 0) {
    let best = pricedVars[0];
    const uniquePrices = new Set<number>();

    for (const item of pricedVars) {
      uniquePrices.add(item.price);
      if (
        item.price < best.price ||
        (item.price === best.price && item.regular > best.regular)
      ) {
        best = item;
      }
    }

    return {
      price: best.price,
      regular: best.regular,
      discountPct: getDiscountPct(best.price, best.regular),
      hasRange: uniquePrices.size > 1,
    };
  }

  return {
    price: parentPrice,
    regular: parentRegular,
    discountPct: getDiscountPct(parentPrice, parentRegular),
    hasRange: false,
  };
}

function collectInStockAttrSlugs(
  product: any,
  predicate: (attr: any) => boolean
): string[] {
  const inStock = getInStockVariations(product);
  if (inStock.length === 0) return [];

  const collected = new Set<string>();
  const parentAttr = Array.isArray(product?.attributes)
    ? product.attributes.find(predicate)
    : null;
  const parentTerms = Array.isArray(parentAttr?.terms)
    ? parentAttr.terms
    : Array.isArray(parentAttr?.options)
      ? parentAttr.options.map((o: any) => ({ slug: o, name: o }))
      : [];

  for (const v of inStock) {
    const attrs = Array.isArray(v?.attributes) ? v.attributes : [];
    const matched = attrs.find(predicate);
    if (!matched) continue;

    const raw = matched.value ?? matched.option ?? matched.text ?? '';
    const slug = normalizeVariationSlug(raw);
    if (slug) {
      collected.add(slug);
    } else if (parentTerms.length > 0) {
      // Atributo comodín ("Cualquiera") en variación con stock
      for (const term of parentTerms) {
        const termSlug = normalizeVariationSlug(term?.slug || term?.name || term);
        if (termSlug) collected.add(termSlug);
      }
    }
  }

  return Array.from(collected);
}

/** Slugs normalizados de tallas que tienen al menos una variación con stock. */
export function getSizesInStock(product: any): string[] {
  return collectInStockAttrSlugs(product, isSizeAttribute);
}

/** Slugs normalizados de colores que tienen al menos una variación con stock. */
export function getColorsInStock(product: any): string[] {
  return collectInStockAttrSlugs(product, isColorAttribute);
}

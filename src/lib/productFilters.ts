/**
 * productFilters.ts
 * Lógica unificada de filtrado y ordenamiento de productos.
 * Usada por ProductGrid.tsx (Home) y FilteredProductList.tsx (Tienda, Sale, Categorías).
 * Cualquier corrección de filtros debe hacerse SOLO aquí.
 */

// ─── Helpers de precio ───────────────────────────────────────────────────────

/** Extrae el precio numérico de un campo de precio de WooCommerce (string o número). */
export function parsePrice(raw: any): number {
    if (!raw && raw !== 0) return 0;
    const match = raw.toString().replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

/** Precio actual del producto (lo que el cliente paga). */
export function getProductPrice(p: any): number {
    const prices = p?.prices || p;
    return parsePrice(
        prices?.price || prices?.sale_price || prices?.regular_price ||
        p?.price || p?.sale_price || p?.regular_price
    );
}

/** Precio tachado (precio original sin descuento). */
export function getProductRegularPrice(p: any): number {
    const prices = p?.prices || p;
    return parsePrice(
        prices?.regular_price || p?.regular_price
    );
}

/** Devuelve true si el producto tiene un descuento real. */
export function isOnSale(p: any): boolean {
    if (p?.on_sale) return true;
    const regular = getProductRegularPrice(p);
    const price   = getProductPrice(p);
    return regular > price && price > 0;
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

/** Filtra por colores seleccionados. */
export function filterByColors(products: any[], selectedColors: string[]): any[] {
    if (!selectedColors.length) return products;
    return products.filter(p =>
        p.attributes?.some((a: any) => {
            const name = (a.name || '').toLowerCase();
            const slug = (a.slug || '').toLowerCase();
            if (!name.includes('color') && !slug.includes('color')) return false;
            const terms = a.terms || (a.options ? a.options.map((o: any) => ({ name: o })) : []);
            return terms.some((t: any) => {
                const val = typeof t === 'string' ? t : (t.slug || t.name || '');
                return val && selectedColors.includes(val.toLowerCase());
            });
        })
    );
}

/** Filtra por tallas seleccionadas. */
export function filterByTallas(products: any[], selectedTallas: string[]): any[] {
    if (!selectedTallas.length) return products;
    return products.filter(p =>
        p.attributes?.some((a: any) => {
            const name = (a.name || '').toLowerCase();
            const slug = (a.slug || '').toLowerCase();
            const isSizeAttr =
                name.includes('talla') || name.includes('tamaño') ||
                name.includes('size')  || name.includes('numero') ||
                name.includes('nmero') || slug.includes('talla') ||
                slug.includes('size');
            if (!isSizeAttr) return false;
            const terms = a.terms || (a.options ? a.options.map((o: any) => ({ name: o })) : []);
            return terms.some((t: any) => {
                const val = typeof t === 'string' ? t : (t.slug || t.name || '');
                return val && selectedTallas.includes(val.toLowerCase());
            });
        })
    );
}

/** Filtra por rango de precio [min, max]. */
export function filterByPriceRange(products: any[], priceRange: [number, number]): any[] {
    const [min, max] = priceRange;
    return products.filter(p => {
        const price = getProductPrice(p);
        return price >= min && price <= max;
    });
}

/** Filtra solo productos que tienen descuento real. */
export function filterOnlyOnSale(products: any[]): any[] {
    return products.filter(isOnSale);
}

/** Filtra por subcategorías seleccionadas. */
export function filterBySubcats(products: any[], selectedSubcats: string[]): any[] {
    if (!selectedSubcats.length) return products;
    
    return products.filter(p => {
        // Validación normal
        const hasNormalSubcat = p.categories?.some((c: any) => selectedSubcats.includes(c.slug)) || (p.category_slug && selectedSubcats.includes(p.category_slug));
        if (hasNormalSubcat) return true;

        // Validación para el filtro virtual "Accesorios de viaje" (atrapa lo que sobra)
        if (selectedSubcats.includes('virtual-accesorios-viaje')) {
            const mainSlugs = [
                'portafolios-de-cuero-para-hombre', 
                'morrales-de-cuero-para-hombre', 
                'maletas-de-viaje-cuero'
            ];
            const isUncategorized = !p.categories?.some((c: any) => mainSlugs.includes(c.slug)) && (!p.category_slug || !mainSlugs.includes(p.category_slug));
            if (isUncategorized) return true;
        }

        return false;
    });
}

/** Filtra por tags seleccionados. */
export function filterByTags(products: any[], selectedTags: string[]): any[] {
    if (!selectedTags.length) return products;
    return products.filter(p =>
        p.tags?.some((t: any) => selectedTags.includes(t.slug))
    );
}

// ─── Ordenamiento ─────────────────────────────────────────────────────────────

export interface SortOption {
    key: string;
    label: string;
    orderBy?: string;
    order?: string;
    onSale?: boolean;
}

/** Ordena productos según la opción de sort seleccionada. */
export function sortProducts(products: any[], sort: SortOption): any[] {
    const result = [...products];

    if (sort.key === 'precio_asc' || sort.orderBy === 'price') {
        result.sort((a, b) =>
            sort.order === 'desc'
                ? getProductPrice(b) - getProductPrice(a)
                : getProductPrice(a) - getProductPrice(b)
        );
    } else if (sort.key === 'precio_desc') {
        result.sort((a, b) => getProductPrice(b) - getProductPrice(a));
    } else if (sort.key === 'descuentos' || sort.orderBy === 'popularity') {
        // Ordenar por mayor % de descuento
        result.sort((a, b) => {
            const regA   = getProductRegularPrice(a);
            const priceA = getProductPrice(a);
            const discA  = regA > 0 ? (regA - priceA) / regA : 0;

            const regB   = getProductRegularPrice(b);
            const priceB = getProductPrice(b);
            const discB  = regB > 0 ? (regB - priceB) / regB : 0;

            return discB - discA;
        });
    } else if (sort.orderBy === 'menu_order') {
        result.sort((a, b) => (a.menu_order || 0) - (b.menu_order || 0));
    }

    return result;
}

/**
 * Función principal que aplica todos los filtros y el ordenamiento.
 * Acepta solo los filtros que apliquen para cada componente.
 */
export function applyFiltersAndSort(
    products: any[],
    options: {
        selectedColors?: string[];
        selectedTallas?: string[];
        selectedSubcats?: string[];
        selectedTags?: string[];
        priceRange?: [number, number];
        sort?: SortOption;
    }
): any[] {
    let result = [...products];

    if (options.selectedSubcats?.length) {
        result = filterBySubcats(result, options.selectedSubcats);
    }
    if (options.selectedColors?.length) {
        result = filterByColors(result, options.selectedColors);
    }
    if (options.selectedTallas?.length) {
        result = filterByTallas(result, options.selectedTallas);
    }
    if (options.selectedTags?.length) {
        result = filterByTags(result, options.selectedTags);
    }
    if (options.priceRange) {
        result = filterByPriceRange(result, options.priceRange);
    }

    // Si el sort es "descuentos", filtrar PRIMERO, luego ordenar
    if (options.sort) {
        if (options.sort.onSale || options.sort.key === 'descuentos') {
            result = filterOnlyOnSale(result);
        }
        result = sortProducts(result, options.sort);
    }

    return result;
}

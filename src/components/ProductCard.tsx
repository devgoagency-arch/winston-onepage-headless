import { useState, useEffect, useMemo } from 'react';

interface Product {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    prices: {
        price: string;
        regular_price: string;
        sale_price: string;
        price_range: any;
        currency_code: string;
        currency_symbol: string;
        currency_minor_unit: number;
        currency_prefix: string;
    };
    images: {
        id?: number;
        src: string;
        alt: string;
        name?: string;
    }[];
    attributes: {
        id: number;
        name: string;
        terms: { id: number; name: string; slug: string }[];
    }[];
    variations?: {
        id: number;
        attributes: { name: string; value?: string; option?: string; id?: string }[];
        stock_status?: string;
    }[];
    variation_images_map?: Record<string, any[]>;
    type?: string;
    variation_ids?: number[];
    on_sale?: boolean;
    featured?: boolean;
    stock_status?: string;
}

interface Props {
    product: Product;
    isSelected?: boolean;
    onSelectionToggle?: (id: number) => void;
    onVariationChange?: (id: number, color: string | null, size: string | null, variationId?: number | null) => void;
    initialColor?: string | null;
    initialSize?: string | null;
}

export default function ProductCard({ product, isSelected, onSelectionToggle, onVariationChange, initialColor, initialSize }: Props) {
    const [isFavorite, setIsFavorite] = useState(false);
    const [selectedColor, setSelectedColor] = useState<string | null>(initialColor || null);
    const [hoveredColor, setHoveredColor] = useState<string | null>(null);
    const [isCardHovered, setIsCardHovered] = useState(false);
    const [failedSyntheticColors, setFailedSyntheticColors] = useState<string[]>([]);
    const [selectedSize, setSelectedSize] = useState<string | null>(initialSize || null);

    // Update state when initial props change
    useEffect(() => {
        if (initialColor && !selectedColor) setSelectedColor(initialColor);
    }, [initialColor]);

    useEffect(() => {
        if (initialSize && !selectedSize) setSelectedSize(initialSize);
    }, [initialSize]);

    // Estado para datos enriquecidos (variaciones) cargados bajo demanda
    const [enrichedProduct, setEnrichedProduct] = useState<any>(null);
    const [isFetchingVariations, setIsFetchingVariations] = useState(false);

    // Efecto para cargar variaciones PROACTIVAMENTE para productos variables
    useEffect(() => {
        // Solo cargar si es variable y no tenemos datos aún
        if (product.type !== 'variable' || enrichedProduct || isFetchingVariations) return;

        // Si ya tenemos el precio regular y las imágenes de variaciones, no es urgente cargar más
        const hasRegularPrice = Number(product.prices.regular_price) > 0;
        const hasVariationImages = product.variation_images_map && Object.keys(product.variation_images_map).length > 0;

        if (hasRegularPrice && hasVariationImages) return;

        const fetchFullProduct = async () => {
            setIsFetchingVariations(true);
            try {

                // Add timestamp to bypass cache and ensure fresh price data
                const res = await fetch(`/api/products?slug=${product.slug}&t=${Date.now()}`);
                if (res.ok) {
                    const fullData = await res.json();
                    if (fullData && fullData.prices) {
                        setEnrichedProduct(fullData);
                    }
                }
            } catch (e) { } finally {
                setIsFetchingVariations(false);
            }
        };

        fetchFullProduct();
    }, [product.slug, product.type, product.variation_images_map]);



    // Reset state when product changes
    useEffect(() => {
        setFailedSyntheticColors([]);
        setSelectedColor(null);
        setSelectedSize(null);
        setHoveredColor(null);
        setIsCardHovered(false);
    }, [product.id]);

    useEffect(() => {
        const favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
        setIsFavorite(favorites.some((fav: any) => fav.id === product.id));
    }, [product.id]);

    // Función de normalización para comparar slugs/nombres de forma robusta
    const normalizeAttr = (str: any): string => {
        if (!str) return '';
        const s = String(str);
        return s.toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/[^a-z0-9]/g, '');      // Quitar todo lo que no sea alfanumérico
    };

    // Calcular el ID de la variación actual basándose en los datos enriquecidos o los originales
    const currentVariationId = useMemo(() => {
        const currentVariations = enrichedProduct?.variations || product.variations;
        if (!currentVariations || currentVariations.length === 0) return null;
        if (!selectedColor && !selectedSize) return null;

        const targetColor = normalizeAttr(selectedColor || '');
        const targetSize = normalizeAttr(selectedSize || '');

        const found = currentVariations.find((v: any) => {
            if (!v || !v.attributes) return false;

            const vColor = v.attributes.find((a: any) => {
                const name = String(a.name || '').toLowerCase();
                const id = String(a.id || '').toLowerCase();
                return name.includes('color') || id.includes('color') || name.includes('selecciona-el-color');
            });

            const vSize = v.attributes.find((a: any) => {
                const name = String(a.name || '').toLowerCase();
                const id = String(a.id || '').toLowerCase();
                return name.includes('talla') || id.includes('talla') || 
                       name.includes('size') || id.includes('size') ||
                       name.includes('tamano') || name.includes('tamaño') ||
                       name.includes('numero') || name.includes('nmero') ||
                       name.includes('selecciona-una-talla');
            });

            const colorValue = normalizeAttr(vColor?.value || vColor?.option || '');
            const sizeValue = normalizeAttr(vSize?.value || vSize?.option || '');

            const matchesColor = !selectedColor || !colorValue || colorValue === targetColor;
            const matchesSize = !selectedSize || !sizeValue || sizeValue === targetSize;

            return matchesColor && matchesSize;
        });

        return found ? found.id : null;
    }, [enrichedProduct, product.variations, selectedColor, selectedSize]);

    useEffect(() => {
        if (onVariationChange) {
            onVariationChange(product.id, selectedColor, selectedSize, currentVariationId);
        }
    }, [selectedColor, selectedSize, product.id, onVariationChange, currentVariationId]);

    const toggleFavorite = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
        let newFavorites;
        if (isFavorite) {
            newFavorites = favorites.filter((fav: any) => fav.id !== product.id);
        } else {
            newFavorites = [...favorites, product];
        }
        localStorage.setItem('wh_favorites', JSON.stringify(newFavorites));
        setIsFavorite(!isFavorite);
        window.dispatchEvent(new Event('storage'));
    };

    // Color Logic
    const colorAttribute = product.attributes?.find(attr =>
        attr.name.toLowerCase().includes('color') || attr.name === 'Pa_selecciona-el-color'
    );

    const sizeAttribute = product.attributes?.find(attr =>
        attr.name.toLowerCase().includes('talla') || attr.name === 'Pa_selecciona-una-talla'
    );

    const activeColor = hoveredColor || selectedColor;

    const colorSynonyms = useMemo(() => {
        if (!activeColor) return [];
        const colorLower = activeColor.toLowerCase().trim();
        const synonyms: Record<string, string[]> = {
            'negro': ['black'],
            'blanco': ['white'],
            'azul': ['blue', 'navy'],
            'rojo': ['red'],
            'cafe': ['brown', 'marron', 'marrón', 'coffee', 'miel', 'tan', 'camel', 'tabaco', 'tabac', 'cognac'],
            'miel': ['tan', 'honey', 'camel', 'cafe', 'brown', 'marron', 'cognac'],
            'verde': ['green'],
            'gris': ['grey', 'gray'],
            'vino': ['vinotinto', 'burgundy', 'wine', 'rojo'],
            'vinotinto': ['vino', 'burgundy', 'wine', 'rojo'],
            'beige': ['arena', 'sand', 'cream', 'crema'],
            'camel': ['tan', 'miel', 'cafe', 'brown', 'cognac'],
            'piel': ['cuero', 'leather', 'tan']
        };
        const words = colorLower.split(/[\s-]+/);
        const results = new Set([colorLower, ...words]);
        words.forEach(w => {
            if (synonyms[w]) synonyms[w].forEach(s => results.add(s));
        });
        if (synonyms[colorLower]) synonyms[colorLower].forEach(s => results.add(s));
        return Array.from(results).filter(s => s.length > 2);
    }, [activeColor]);

    const displayImages = useMemo(() => {
        const currentProduct = enrichedProduct || product;
        const active = hoveredColor || selectedColor;
        if (!active) return currentProduct.images;

        const colorSlug = active.toLowerCase().trim();
        const colorTerm = colorAttribute?.terms.find(t => t.slug === active);
        const colorName = colorTerm?.name.toLowerCase().trim() || "";

        // --- 1. Obtener imágenes de la Variación (API) ---
        let varImages: any[] = [];
        if (currentProduct.variation_images_map) {
            const matchedKey = Object.keys(currentProduct.variation_images_map).find(
                key => {
                    const k = key.toLowerCase().trim();
                    return k === colorSlug ||
                        k.includes(colorSlug) ||
                        colorSlug.includes(k) ||
                        (colorSlug === 'vinotinto' && k === 'vino') ||
                        (colorSlug === 'vino' && k === 'vinotinto');
                }
            );
            if (matchedKey && currentProduct.variation_images_map[matchedKey]) {
                varImages = currentProduct.variation_images_map[matchedKey];
            }
        }

        // --- 2. Obtener imágenes de la Galería (Filtrado Robusto) ---
        const patterns = [
            `-${colorSlug}`, `_${colorSlug}`, ` ${colorSlug}`,
            `-${colorName}`, `_${colorName}`, ` ${colorName}`,
            ...colorSynonyms.flatMap(s => [`-${s}`, `_${s}`, ` ${s}`])
        ];

        const galleryMatches = currentProduct.images.filter((img: { src: string; alt: string; name?: string }) => {
            const src = (img.src || "").toLowerCase();
            const alt = (img.alt || "").toLowerCase();
            const name = (img.name || "").toLowerCase();

            const hasPattern = patterns.some(p => src.includes(p) || alt.includes(p) || name.includes(p));
            const isSuffix = new RegExp(`[-_ ](${colorSlug}|${colorName})\\.(jpg|jpeg|png|webp)$`, 'i').test(src);
            const isFuzzy = colorSynonyms.some(s => src.includes(s) || alt.includes(s));

            return hasPattern || isSuffix || isFuzzy;
        });

        // Combinar y de-duplicar
        const combined = [...varImages];
        galleryMatches.forEach((img: { src: string; alt: string; name?: string }) => {
            if (!combined.some(c => c.src === img.src)) combined.push(img);
        });

        if (combined.length > 0) return combined;

        // --- 3. Fallback: Predicción Sintética (Mejorada) ---
        if (currentProduct.images.length > 0 && colorAttribute && !failedSyntheticColors.includes(active)) {
            const baseImg = currentProduct.images[0];
            const baseSrc = baseImg.src;

            // Detectar qué color tiene la imagen base buscando en TODAS las fotos si es necesario
            let colorInUrl = colorAttribute.terms.find(t => {
                const ts = t.slug.toLowerCase();
                const tn = t.name.toLowerCase();
                const s = baseSrc.toLowerCase();
                return s.includes(ts) || s.includes(tn) || (ts.includes('vino') && s.includes('vino'));
            });

            // Si la base no tiene color, buscar en el resto de la galería para identificar el color "base" del modelo
            if (!colorInUrl) {
                for (const img of currentProduct.images) {
                    const found = colorAttribute.terms.find(t => {
                        const s = img.src.toLowerCase();
                        return s.includes(t.slug.toLowerCase()) || s.includes(t.name.toLowerCase());
                    });
                    if (found) {
                        colorInUrl = found;
                        break;
                    }
                }
            }

            if (colorInUrl) {
                if (colorInUrl.slug === active) {
                   return currentProduct.images.filter((img: { src: string }) => {
                       const s = img.src.toLowerCase();
                       return s.includes(colorInUrl!.slug) || s.includes(colorInUrl!.name.toLowerCase());
                   });
                }

                const match = baseSrc.match(new RegExp(colorInUrl.slug, 'i')) ||
                    baseSrc.match(new RegExp(colorInUrl.name, 'i')) ||
                    baseSrc.match(/vino/i);

                if (match) {
                    const matchedText = match[0];
                    const isCapitalized = matchedText[0] === matchedText[0].toUpperCase();

                    let replacement = active;
                    if (active === 'vinotinto' && matchedText.toLowerCase() === 'vino') {
                        replacement = isCapitalized ? 'Vino' : 'vino';
                    } else if (isCapitalized) {
                        replacement = active.charAt(0).toUpperCase() + active.slice(1).toLowerCase();
                    }

                    try {
                        const regex = new RegExp(matchedText, 'g');
                        // Intentar predecir TODA la galería
                        const syntheticGallery = currentProduct.images.map((img: { src: string; alt: string }) => {
                            const newSrc = img.src.replace(regex, replacement);
                            if (newSrc !== img.src) {
                                return { ...img, isSynthetic: true, src: newSrc };
                            }
                            return null;
                        }).filter((img: any): img is any => img !== null);

                        if (syntheticGallery.length > 0) return syntheticGallery;

                        const newSrc = baseSrc.replace(regex, replacement);
                        if (newSrc !== baseSrc) return [{ ...baseImg, isSynthetic: true, src: newSrc }];
                    } catch (e) { }
                }
            }
        }

        return [currentProduct.images[0]];
    }, [selectedColor, hoveredColor, product, enrichedProduct, colorAttribute, failedSyntheticColors, colorSynonyms]);

    const mainImage = displayImages[0] || product.images[0];
    const hoverImageRaw = displayImages[1];

    const guessedHoverSrc = useMemo(() => {
        if (!mainImage?.src) return null;

        const src = mainImage.src;
        // Caso 1: Patrón oficial Winstonandharry (Cambiar -1 por -2)
        const patternWith1 = /([-_])1(.*?)(?=\.[a-z0-9.]+$)/i;
        if (src.match(patternWith1)) {
            return src.replace(patternWith1, '$12$2');
        }

        // Caso 2: Intento a ciegas si no hay -1, añadimos -2 (ej: zapato.jpg -> zapato-2.jpg)
        const extensionPattern = /(?=\.[a-z0-9.]+$)/i;
        return src.replace(extensionPattern, '-2');
    }, [mainImage]);

    const [isHoverImageValid, setIsHoverImageValid] = useState(true);
    const [hoverImageSrc, setHoverImageSrc] = useState<string | null>(null);

    // Prioridad de hover: 
    // 1. Segunda imagen del set actual (ej: variantes predichas)
    // 2. Imagen predicha (-2) de la principal actual
    const baseHoverSrc = (displayImages.length > 1 ? displayImages[1].src : null) || guessedHoverSrc;
    const effectiveHoverSrc = hoverImageSrc || baseHoverSrc;

    useEffect(() => {
        setIsHoverImageValid(true);
        setHoverImageSrc(baseHoverSrc);
    }, [baseHoverSrc, activeColor]);

    // El hover funciona si hay una imagen src válida
    // Si displayImages[1] existe, lo usamos directamente
    // Si no, usamos guessedHoverSrc que predice la URL -2
    const isHoverActive = isCardHovered && !!effectiveHoverSrc;

    const priceData = enrichedProduct?.prices || product.prices;
    const currencyMinorUnit = priceData.currency_minor_unit || 0;

    const regularPrice = Number(priceData.regular_price || 0);
    const price = Number(priceData.price || 0);

    const isSale = product.on_sale || (regularPrice > price && price > 0);

    const renderRegularPrice = regularPrice / (10 ** currencyMinorUnit);
    const renderPrice = price / (10 ** currencyMinorUnit);
    const currencySymbol = priceData.currency_prefix || priceData.currency_symbol;

    return (
        <div
            className="product-card"
            onMouseEnter={() => setIsCardHovered(true)}
            onMouseLeave={() => setIsCardHovered(false)}
        >
            <div className="card-content">
                <a href={`/productos/${product.slug}${selectedColor ? `?color=${selectedColor}` : ''}`} className="image-link">
                    <div className={`product-image ${isHoverActive ? 'hover-active' : ''}`}>
                        <div className="badges-container">
                            {isSale && (
                                <div className="badge discount-badge">
                                    {(() => {
                                        const discount = (renderRegularPrice > renderPrice)
                                            ? Math.round(((renderRegularPrice - renderPrice) / renderRegularPrice) * 100)
                                            : 0;

                                        return discount > 0 ? `-${discount}%` : 'OFERTA';
                                    })()}
                                </div>
                            )}
                            {product.featured && (
                                <div className="badge hot-badge">
                                    HOT
                                </div>
                            )}
                        </div>

                        <picture className="primary-image">
                            <img
                                key={mainImage?.src}
                                src={mainImage?.src || 'https://via.placeholder.com/300x400?text=Zapato'}
                                alt={mainImage?.alt || product.name}
                                className="fade-in reveal-on-scroll is-visible"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.onerror = null;

                                    let currentSrc = target.src;

                                    // 1. Intentar quitar .webp (case insensitive)
                                    if (currentSrc.toLowerCase().endsWith('.webp')) {
                                        currentSrc = currentSrc.replace(/\.webp$/i, '');
                                        target.src = currentSrc;
                                        return;
                                    }

                                    // 2. Limpiar sufijo de edición -e123...
                                    const cleanSrc = currentSrc.replace(/-e\d+(?=\.(jpg|jpeg|png))/i, '');

                                    if (cleanSrc !== target.src) {
                                        target.src = cleanSrc;
                                    } else if ((mainImage as any)?.isSynthetic && activeColor) {
                                        // Si la predicción falló totalmente, bloqueamos ese color para este producto
                                        setFailedSyntheticColors(prev => [...prev, activeColor]);
                                        // Y forzamos el regreso a la imagen original inmediatamente
                                        target.src = product.images[0]?.src || '';
                                    } else {
                                        // Fallback final
                                        target.src = 'https://via.placeholder.com/300x400?text=Zapato';
                                    }
                                }}
                            />
                        </picture>

                        {effectiveHoverSrc && (
                            <picture className="hover-image">
                                <img
                                    src={effectiveHoverSrc}
                                    alt={hoverImageRaw?.alt || product.name}
                                    className="reveal-on-scroll is-visible"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        const currentSrc = target.src;

                                        // Si falla con .webp, intentar sin .webp
                                        if (currentSrc.toLowerCase().endsWith('.webp')) {
                                            const srcWithoutWebp = currentSrc.replace(/\.webp$/i, '');
                                            target.src = srcWithoutWebp;
                                        } else if (guessedHoverSrc && effectiveHoverSrc !== guessedHoverSrc) {
                                            // Si es la imagen de variation y falla, intentar con guessedHoverSrc
                                            setHoverImageSrc(guessedHoverSrc);
                                        } else {
                                            setIsHoverImageValid(false);
                                        }
                                    }}
                                />
                            </picture>
                        )}
                        <button
                            className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                            onClick={toggleFavorite}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </button>

                        {colorAttribute && (
                            <div className="card-colors-overlay">
                                {(() => {
                                    const currentVariations = enrichedProduct?.variations || product.variations;

                                    // 1. Si es un producto VARIABLE, NO mostramos nada hasta tener la "verdad" de las variaciones.
                                    // Esto evita el FOUC (Flash of Unstyled/Incorrect Content) donde aparecen 10 puntos y luego 2.
                                    if (product.type === 'variable' && (!currentVariations || currentVariations.length === 0)) {
                                        return null;
                                    }

                                    // 2. Filtramos la realidad si tenemos los datos (SSR o Enriquecidos)
                                    let termsToDisplay = colorAttribute.terms;
                                    if (currentVariations && currentVariations.length > 0) {
                                        termsToDisplay = colorAttribute.terms.filter(term =>
                                            currentVariations.some((v: any) =>
                                                v.attributes.some((a: any) =>
                                                    (a.name.toLowerCase().includes('color') || a.name === 'Pa_selecciona-el-color') &&
                                                    (a.value || a.option || '').toLowerCase() === term.slug.toLowerCase()
                                                )
                                            )
                                        );
                                    }

                                    // 3. Mostrar siempre que haya algo real que mostrar
                                    if (termsToDisplay.length === 0) return null;

                                    return termsToDisplay.map((term: any) => (
                                        <button
                                            key={term.id}
                                            type="button"
                                            className={`color-swatch-btn ${selectedColor === term.slug ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setSelectedColor(term.slug);
                                            }}
                                            onMouseEnter={() => setHoveredColor(term.slug)}
                                            onMouseLeave={() => setHoveredColor(null)}
                                            title={term.name}
                                        >
                                            <span
                                                className="color-circle"
                                                style={{ backgroundColor: getColorCode(term.slug) }}
                                            />
                                        </button>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>
                </a>

                {onSelectionToggle && (
                    <div
                        className={`selection-overlay ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectionToggle(product.id);
                        }}
                    >
                        <div className="check-button">
                            {isSelected ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : null}
                        </div>
                    </div>
                )}

                    <div className="product-info">
                    <div className="info-top-row">
                        <h3>
                            <a href={`/productos/${product.slug}${selectedColor ? `?color=${selectedColor}` : ''}`}>{product.name}</a>
                        </h3>
                    </div>

                    {/* NUEVOS SELECTORES PARA BUNDLES / LOOK DE LA SEMANA */}
                    {onSelectionToggle && (
                        <div className="card-bundle-selectors">
                            {colorAttribute && (
                                <div className="bundle-selector-field">
                                    <select 
                                        value={selectedColor || ''} 
                                        onChange={(e) => setSelectedColor(e.target.value)}
                                        className="variation-select"
                                    >
                                        <option value="">Color</option>
                                        {(() => {
                                            const currentVariations = enrichedProduct?.variations || product.variations;
                                            let termsToDisplay = colorAttribute.terms;
                                            if (product.type === 'variable' && currentVariations && currentVariations.length > 0) {
                                                termsToDisplay = colorAttribute.terms.filter(term =>
                                                    currentVariations.some((v: any) =>
                                                        v.attributes.some((a: any) =>
                                                            (a.name.toLowerCase().includes('color') || a.name === 'Pa_selecciona-el-color') &&
                                                            (a.value || a.option || '').toLowerCase() === term.slug.toLowerCase()
                                                        )
                                                    )
                                                );
                                            }
                                            return termsToDisplay.map(term => (
                                                <option key={term.id} value={term.slug}>{term.name}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            )}

                            {sizeAttribute && (
                                <div className="bundle-selector-field">
                                    <select 
                                        value={selectedSize || ''} 
                                        onChange={(e) => setSelectedSize(e.target.value)}
                                        className="variation-select"
                                    >
                                        <option value="">Talla</option>
                                        {(() => {
                                            const currentVariations = enrichedProduct?.variations || product.variations;
                                            let termsToDisplay = sizeAttribute.terms;
                                            if (product.type === 'variable' && currentVariations && currentVariations.length > 0) {
                                                termsToDisplay = sizeAttribute.terms.filter(term =>
                                                    currentVariations.some((v: any) =>
                                                        v.attributes.some((a: any) =>
                                                            (a.name.toLowerCase().includes('talla') || a.name === 'Pa_selecciona-una-talla') &&
                                                            (a.value || a.option || '').toLowerCase() === term.slug.toLowerCase()
                                                        )
                                                    )
                                                );
                                            }
                                            return termsToDisplay.map(term => (
                                                <option key={term.id} value={term.slug}>{term.name}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="price">
                        {isSale ? (
                            <div className="price-wrapper">
                                <span className="old-price">
                                    {currencySymbol}{new Intl.NumberFormat('es-CO').format(renderRegularPrice)}
                                </span>
                                <span className="sale-price highlight">
                                    {currencySymbol}{new Intl.NumberFormat('es-CO').format(renderPrice)}
                                </span>
                            </div>
                        ) : (
                            <span className="current-price">
                                {currencySymbol}{new Intl.NumberFormat('es-CO').format(renderPrice)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
        .product-card {
          background: #fff;
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 0;
          position: relative;
        }

        .product-image {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background-color: #f6f6f6;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .product-image img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
        }

        .hover-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1;
        }

        .favorite-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            cursor: pointer;
            z-index: 10;
            transition: all 0.2s ease;
            color: var(--color-green);
            padding: 0;
        }

        .favorite-btn:hover { transform: scale(1.1); color: #d62828; }
        .favorite-btn.active { color: #d62828; }

        .badges-container {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 10;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .badge {
            font-size: 0.65rem;
            font-weight: 700;
            padding: 4px 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-radius: 1px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            color: #fff;
            width: fit-content;
        }

        .hot-badge {
            background-color: #E63946; /* Hot red badge */
        }

        .discount-badge {
            background-color: #A98B68; /* Sandy gold discount badge */
        }

        .product-card:hover .product-image img { transform: scale(1.05); }
        .product-image.hover-active .hover-image { opacity: 1; }
        .product-image.hover-active .primary-image img { opacity: 0; } 
        /* Si no hay hover activo (cargando o error), la principal se queda */

        .product-info { 
            padding: 10px 0.5rem; 
        }

        .info-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.3rem;
        }
        
        .product-info h3 { 
           margin: 0;
           line-height: 1;
        }

        .product-info h3 a {
          font-family: var(--font-products); 
          font-size: 0.85rem; 
          font-weight: 300; 
          color: #121212; 
          text-decoration: none;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .price { 
            margin-top: 5px;
        }

        .price-wrapper {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .old-price { 
            text-decoration: line-through; 
            color: #b5b5b5; 
            font-size: 0.8rem;
            font-weight: 300;
        }

        .sale-price.highlight { 
            color: #A98B68; 
            font-weight: 600; 
            font-size: 0.95rem;
        }

        .current-price {
            color: #666666;
            font-weight: 500;
            font-size: 0.9rem;
        }

        .card-colors-overlay {
            position: absolute;
            bottom: 12px;
            right: 12px;
            display: flex;
            gap: 6px;
            align-items: center;
            z-index: 15;
            background: transparent;
            padding: 5px 10px;
            border-radius: 30px;
            transition: all 0.3s ease;
        }

        .card-bundle-selectors {
            display: flex;
            gap: 5px;
            margin: 8px 0;
            padding: 0;
        }

        .bundle-selector-field {
            flex: 1;
        }

        .bundle-selector-field select {
            width: 100%;
            padding: 4px 6px;
            font-size: 0.7rem;
            border: 1px solid #e0e0e0;
            border-radius: 2px;
            font-family: var(--font-paragraphs);
            background: #fff;
            color: #333;
            cursor: pointer;
            outline: none;
        }

        .bundle-selector-field select:focus {
            border-color: var(--color-beige);
        }

        .product-card:hover .card-colors-overlay {
            background: rgba(255, 255, 255, 0.0);
            border-color: #fff;
        }

        .color-swatch-btn {
            background: none;
            border: none;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s ease;
            position: relative;
            width: 15px;
            height: 15px;
        }

        .color-circle {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 1.5px solid #fff;
            display: block;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .color-swatch-btn:hover .color-circle { transform: scale(1.15); }
        
        .color-swatch-btn.active::after {
            content: '';
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            border: 1.5px solid #121212;
            border-radius: 50%;
        }
        
        .color-swatch-btn.active .color-circle {
            border-color: #fff;
            box-shadow: 0 0 0 1px #fff;
        }

        .selection-overlay {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 20;
            cursor: pointer;
        }

        .check-button {
            width: 24px;
            height: 24px;
            background: #fff;
            border: 1.5px solid #121212;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            color: #fff;
        }

        .selection-overlay.selected .check-button {
            background: #155338;
            border-color: #155338;
        }

        .check-button svg {
            width: 14px;
            height: 14px;
        }

        .selection-overlay:hover .check-button {
            transform: scale(1.1);
        }

        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0.5; } to { opacity: 1; } }
      `}</style>
        </div>
    );
}

function getColorCode(slug: string): string {
    const colors: Record<string, string> = {
        'negro': '#121212',
        'cafe': '#6F4E37',
        'miel': '#D4A373',
        'azul': '#1B3F8B',
        'verde': '#155338',
        'vino': '#722F37',
        'vinotinto': '#722F37',
        'vino-tinto': '#722F37',
        'burgundy': '#722F37',
        'tabaco': '#8B5A2B',
        'cognac': '#9A463D',
        'rojo': '#C41E3A',
        'blanco': '#FFFFFF',
        'gris': '#888888',
        'plata': '#C0C0C0',
        'silver': '#C0C0C0',
        'oro': '#D4AF37',
        'gold': '#D4AF37',
        'beige': '#F5F5DC',
        'arena': '#E2CBA4',
        'tabac': '#8B5A2B',
        'mostaza': '#E1AD01',
        'azul-claro': '#ADD8E6',
        'light-blue': '#ADD8E6',
        'morado': '#800080',
        'purple': '#800080',
        'cafe-claro': '#A67B5B',
        'rosa': '#FFC0CB',
        'rosado': '#FFC0CB',
        'rosada': '#FFC0CB',
        'pink': '#FFC0CB',
        'camel': '#C19A6B',
        'marron': '#6F4E37',
        'marrón': '#6F4E37'
    };
    return colors[slug.toLowerCase()] || colors[slug.toLowerCase().replace(/-/g, '')] || '#ddd';
}

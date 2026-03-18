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
        attributes: { name: string; value: string }[];
    }[];
    variation_images_map?: Record<string, any[]>;
}

interface Props {
    product: Product;
    isSelected?: boolean;
    onSelectionToggle?: (id: number) => void;
}

export default function ProductCard({ product, isSelected, onSelectionToggle }: Props) {
    const [isFavorite, setIsFavorite] = useState(false);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [hoveredColor, setHoveredColor] = useState<string | null>(null);
    const [isCardHovered, setIsCardHovered] = useState(false);
    const [failedSyntheticColors, setFailedSyntheticColors] = useState<string[]>([]);

    // Reset state when product changes
    useEffect(() => {
        setFailedSyntheticColors([]);
        setSelectedColor(null);
        setHoveredColor(null);
        setIsCardHovered(false);
    }, [product.id]);

    useEffect(() => {
        const favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
        setIsFavorite(favorites.some((fav: any) => fav.id === product.id));
    }, [product.id]);

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
        attr.name.toLowerCase().includes('color')
    );

    const activeColor = hoveredColor || selectedColor;

    const displayImages = useMemo(() => {
        if (!activeColor) return product.images;

        const colorSlug = activeColor.toLowerCase().trim();

        // 1. Prioridad: Mapa de imágenes de variaciones (Enriquecido por la API)
        if (product.variation_images_map) {
            const matchedKey = Object.keys(product.variation_images_map).find(
                key => key.toLowerCase().trim() === colorSlug
            );
            if (matchedKey && product.variation_images_map[matchedKey]) {
                return product.variation_images_map[matchedKey];
            }
        }

        // 2. Fallback: Filtrado robusto
        const colorTerm = colorAttribute?.terms.find(t => t.slug === activeColor);
        const colorName = colorTerm?.name.toLowerCase() || "";

        const matches = product.images.filter(img => {
            const src = (img.src || "").toLowerCase();
            const alt = (img.alt || "").toLowerCase();
            const name = (img.name || "").toLowerCase();

            return src.includes(`-${colorSlug}`) ||
                src.includes(`_${colorSlug}`) ||
                src.includes(`-${colorName}`) ||
                src.includes(`_${colorName}`) ||
                alt.includes(colorName) ||
                name.includes(colorName);
        });

        if (matches.length > 0) return matches;

        // 3. Fallback Avanzado: Predicción de URL (Basado en la convención de Winston & Harry)
        if (product.images.length > 0 && colorAttribute && !failedSyntheticColors.includes(activeColor)) {
            const baseImage = product.images[0];
            const baseSrc = baseImage.src;

            // Buscamos qué color tiene la imagen base en su nombre de archivo
            const colorInUrl = colorAttribute.terms.find(t =>
                baseSrc.toLowerCase().includes(t.slug.toLowerCase()) ||
                baseSrc.toLowerCase().includes(t.name.toLowerCase())
            );

            if (colorInUrl) {
                const activeColorTerm = colorAttribute.terms.find(t => t.slug === activeColor);
                if (activeColorTerm) {
                    const colorToReplace = baseSrc.match(new RegExp(colorInUrl.name, 'i')) ? colorInUrl.name : colorInUrl.slug;
                    const newColorName = activeColorTerm.name;
                    const newColorSlug = activeColorTerm.slug;

                    // Probamos reemplazo con Nombre (ej: Negro) y si falla el navegador el onError lo detectará
                    // Pero para ser más seguros, intentamos mantener el casing original
                    const isCapitalized = colorToReplace[0] === colorToReplace[0].toUpperCase();
                    let finalNewColor = newColorName;
                    if (isCapitalized) {
                        finalNewColor = finalNewColor.charAt(0).toUpperCase() + finalNewColor.slice(1).toLowerCase();
                    } else {
                        finalNewColor = finalNewColor.toLowerCase();
                    }

                    const predictedImages = [];
                    // Imagen 1 (Principal)
                    let src1 = baseSrc.replace(new RegExp(colorToReplace, 'gi'), finalNewColor);
                    predictedImages.push({
                        ...baseImage,
                        id: 999999,
                        src: src1,
                        alt: `${product.name} ${finalNewColor}`
                    });

                    // Imagen 2 (Hover - Intento inteligente)
                    let src2 = src1;
                    const patternWith1 = /([-_])1(.*?)(?=\.[a-z0-9.]+$)/i;
                    if (src2.match(patternWith1)) {
                        src2 = src2.replace(patternWith1, '$12$2');
                    } else {
                        // Si no tiene -1, probamos añadir -2 antes de la extensión
                        const extensionPattern = /(?=\.[a-z0-9.]+$)/i;
                        src2 = src2.replace(extensionPattern, '-2');
                    }

                    if (src2 !== src1) {
                        predictedImages.push({
                            ...baseImage,
                            id: 999999 + 1,
                            src: src2,
                            alt: `${product.name} ${finalNewColor} vista 2`
                        });
                    }

                    return predictedImages;
                }
            }
        }

        return product.images;
    }, [activeColor, product.images, colorAttribute, product.variation_images_map, failedSyntheticColors]);

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

    const regularPrice = parseInt(product.prices.regular_price);
    const price = parseInt(product.prices.price);
    const currencyMinorUnit = product.prices.currency_minor_unit || 0;
    const isSale = regularPrice > price;
    const renderRegularPrice = regularPrice / (10 ** currencyMinorUnit);
    const renderPrice = price / (10 ** currencyMinorUnit);
    const currencySymbol = product.prices.currency_prefix || product.prices.currency_symbol;

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
                                <span className="badge badge-sale">
                                    -{Math.round(((renderRegularPrice - renderPrice) / renderRegularPrice) * 100)}%
                                </span>
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
                                    } else if (mainImage?.id === 999999 && activeColor) {
                                        // Si la predicción falló totalmente
                                        setFailedSyntheticColors(prev => [...prev, activeColor]);
                                    } else {
                                        target.src = 'https://via.placeholder.com/300x400?text=Sin+Imagen';
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

                        {colorAttribute && (
                            <div className="card-colors">
                                {colorAttribute.terms.map((term) => (
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
                                ))}
                            </div>
                        )}
                    </div>

                    <p className="price">
                        {isSale ? (
                            <>
                                <span className="old-price">
                                    {currencySymbol}{new Intl.NumberFormat('es-CO').format(renderRegularPrice)}
                                </span>
                                <span className="sale-price">
                                    {currencySymbol}{new Intl.NumberFormat('es-CO').format(renderPrice)}
                                </span>
                            </>
                        ) : (
                            <span>
                                {currencySymbol}{new Intl.NumberFormat('es-CO').format(renderPrice)}
                            </span>
                        )}
                    </p>
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
        }

        .badge {
            color: #fff;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 4px 8px;
            text-transform: uppercase;
        }
        .badge-sale { background-color: #A98B68; }

        .product-card:hover .product-image img { transform: scale(1.05); }
        .product-image.hover-active .hover-image { opacity: 1; }
        .product-image.hover-active .primary-image img { opacity: 0; } 
        /* Si no hay hover activo (cargando o error), la principal se queda */

        .product-info { 
            padding: 10px 1.5rem; 
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
            color: #a3a3a3; 
            font-weight: 400; 
            font-size: 0.85rem; 
            font-family: var(--font-products);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .old-price { text-decoration: line-through; color: #ccc; }
        .sale-price { color: var(--color-beige); font-weight: 500; }

        .card-colors {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .color-swatch-btn {
            background: none;
            border: none;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            width: 19px;
            height: 19px;
        }

        .color-circle {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 1px solid rgba(0,0,0,0.1);
            display: block;
        }

        .color-swatch-btn:hover .color-circle { transform: scale(1.1); }
        
        .color-swatch-btn.active::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 1px solid #121212;
            border-radius: 50%;
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
        'tabac': '#8B5A2B'
    };
    return colors[slug.toLowerCase()] || '#ddd';
}

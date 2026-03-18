import { useState, useEffect, useMemo, useRef } from 'react';
import ProductCard from './ProductCard';

interface Product {
  id: number;
  name: string;
  description: string;
  short_description: string;
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
    id: number;
    src: string;
    alt: string;
    name: string;
  }[];
  attributes: {
    id: number;
    name: string;
    terms: { id: number; name: string; slug: string }[];
  }[];
  categories: { id: number; name: string; slug: string }[];
  variations?: {
    id: number;
    attributes: { name: string; value: string }[];
    image?: { id: number; src: string; alt: string };
  }[];
  variation_images_map?: Record<string, any[]>;
  related_products?: any[];
  fbt_products?: any[];
}

interface Props {
  initialProduct: Product;
}

const SIZE_GUIDE_DATA = [
  ['37', '37', '6.5', '5', '39', '24.5'],
  ['38', '38', '7.5', '6', '41.5', '25.5'],
  ['39', '39', '8', '7', '41', '26'],
  ['40', '40', '9', '8', '42', '27'],
  ['41', '41', '9.5', '8.5', '42.5', '27.5'],
  ['42', '42', '10', '9', '43', '28'],
  ['43', '43', '11', '10', '44', '29'],
  ['44', '44', '12', '11', '45', '29.5'],
];

export default function ProductDetail({ initialProduct }: Props) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const product = initialProduct;
  const [selectedFbtIds, setSelectedFbtIds] = useState<number[]>([]);

  useEffect(() => {
    if (product.fbt_products) {
      setSelectedFbtIds([product.id, ...product.fbt_products.map((p: any) => p.id)]);
    } else {
      setSelectedFbtIds([product.id]);
    }
  }, [product.id, product.fbt_products]);

  const toggleFbtSelection = (id: number) => {
    setSelectedFbtIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const sizeAttribute = product.attributes?.find(attr =>
    attr.name.toLowerCase().includes('talla') ||
    attr.terms.some(t => !isNaN(Number(t.name)))
  );

  // Ordenar las tallas numéricamente o por orden de ropa (XS, S, M, L, XL, XXL)
  if (sizeAttribute) {
    const sizeOrder: Record<string, number> = {
      'xs': 1, 's': 2, 'm': 3, 'l': 4, 'xl': 5, 'xxl': 6, '2xl': 6, 'xxxl': 7, '3xl': 7
    };

    sizeAttribute.terms.sort((a, b) => {
      const nameA = a.name.toLowerCase().trim();
      const nameB = b.name.toLowerCase().trim();

      // Prioridad 1: Orden predefinido de ropa
      if (sizeOrder[nameA] && sizeOrder[nameB]) {
        return sizeOrder[nameA] - sizeOrder[nameB];
      }

      // Prioridad 2: Orden numérico (Zapatos)
      const valA = parseFloat(nameA.replace(',', '.'));
      const valB = parseFloat(nameB.replace(',', '.'));

      if (!isNaN(valA) && !isNaN(valB)) {
        return valA - valB;
      }

      // Prioridad 3: Alfabético (Fallback)
      return nameA.localeCompare(nameB);
    });
  }

  const hasSize = !!sizeAttribute;

  const colorAttribute = product.attributes?.find(attr =>
    attr.name.toLowerCase().includes('color')
  );

  const currentSizeInfo = useMemo(() => {
    if (!selectedSize || !sizeAttribute) return null;
    const sizeName = sizeAttribute.terms.find(t => t.slug === selectedSize)?.name;
    const found = SIZE_GUIDE_DATA.find(s => s[1] === sizeName);
    if (!found) return null;
    return {
      wh: found[1],
      us: found[2],
      eu: found[4],
      cm: found[5]
    };
  }, [selectedSize, sizeAttribute]);

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
    setIsFavorite(favorites.some((fav: any) => fav.id === product.id));
  }, [product.id]);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const colorParam = params.get('color');
    const tallaParam = params.get('talla');

    if (colorParam) setSelectedColor(colorParam);
    if (tallaParam) setSelectedSize(tallaParam);
  }, []);

  const mainCategory = useMemo(() => {
    if (!product.categories || product.categories.length === 0) return null;
    const cat = product.categories.find(c =>
      !c.name.includes('$') &&
      !c.name.toLowerCase().includes('regalo') &&
      !c.name.toLowerCase().includes('grande')
    );
    return cat;
  }, [product.categories]);

  /* Restaurando lógica de filtrado de imágenes por color */
  const filteredImages = useMemo(() => {
    // Si NO hay color seleccionado, mostrar solo las predeterminadas
    if (!selectedColor) return product.images;

    const colorSlug = selectedColor.toLowerCase();

    // 1. Prioridad: Mapa de imágenes de variaciones (API)
    if (product.variation_images_map && product.variation_images_map[colorSlug]) {
      const specificImages = product.variation_images_map[colorSlug];
      // Si la variante tiene imágenes, las usamos.
      if (specificImages.length > 0) return specificImages;
    }

    // 2. Fallback: Filtrado por nombre/alt
    const colorTerm = colorAttribute?.terms.find(t => t.slug === selectedColor);
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

    // 3. Last resort: Si no encontramos nada específico, mostrar todo
    return product.images;
  }, [selectedColor, product.images, colorAttribute, product.variation_images_map]);

  /* State for Lightbox Gallery */
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [verifiedGuessedImages, setVerifiedGuessedImages] = useState<string[]>([]);

  // Reset verified images when color changes
  useEffect(() => {
    setVerifiedGuessedImages([]);
  }, [selectedColor, product.name]);

  const handleGuessedImageLoad = (src: string) => {
    setVerifiedGuessedImages(prev => {
      if (prev.includes(src)) return prev;
      return [...prev, src];
    });
  };

  // Rango máximo de fotos adicionales que intentaremos adivinar de WooCommerce
  const GUESSED_PHOTO_RANGE = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const galleryDOMImages = useMemo(() => {
    // Base images
    const images = filteredImages.map(img => ({ src: img.src, alt: img.alt || product.name }));

    // Append Verified Guessed images IN ORDER
    GUESSED_PHOTO_RANGE.forEach(num => {
      const match = verifiedGuessedImages.find(src => {
        const m = src.match(/[-_](\d+)(?:-e\d+)?\.(jpg|jpeg|png|webp)$/i);
        return m && parseInt(m[1], 10) === num;
      });

      if (match) {
        const exists = images.some(img => img.src === match);
        if (!exists) {
          images.push({ src: match, alt: `${product.name} vista ${num}` });
        }
      }
    });

    return images;
  }, [filteredImages, verifiedGuessedImages, product.name]);

  // Función dinámica encargada de contar las fotos disponibles (WooCommerce + Cargadas)
  // Esta es la función que solicitaste para calcular dinámicamente cuántos puntos mostrar.
  const getGalleryCount = () => {
    return galleryDOMImages.length;
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setIsZoomed(false); // Reset zoom on close
    document.body.style.overflow = '';
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isZoomed) {
      setIsZoomed(false); // Reset zoom on slide change
    }
    setLightboxIndex((prev) => (prev + 1) % galleryDOMImages.length);
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isZoomed) {
      setIsZoomed(false); // Reset zoom on slide change
    }
    setLightboxIndex((prev) => (prev - 1 + galleryDOMImages.length) % galleryDOMImages.length);
  };

  const toggleZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsZoomed(!isZoomed);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isZoomed) return;
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPosition({ x, y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isZoomed) return;
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - left) / width) * 100;
    const y = ((touch.clientY - top) / height) * 100;
    setZoomPosition({ x, y });
  };



  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveImageIndex(0);
    if (galleryRef.current) galleryRef.current.scrollLeft = 0;
  }, [filteredImages]);

  const slideTo = (index: number) => {
    if (galleryRef.current) {
      const width = galleryRef.current.offsetWidth;
      galleryRef.current.scrollTo({
        left: index * width,
        behavior: 'smooth'
      });
      setActiveImageIndex(index);
    }
  };

  const nextSlide = () => {
    const nextIndex = (activeImageIndex + 1) % galleryDOMImages.length;
    slideTo(nextIndex);
  };

  const prevSlide = () => {
    const prevIndex = (activeImageIndex - 1 + galleryDOMImages.length) % galleryDOMImages.length;
    slideTo(prevIndex);
  };



  const isCombinationAvailable = (color: string | null, size: string | null) => {
    if (!product.variations || product.variations.length === 0) return true;

    return product.variations.some(variation => {
      const vColor = variation.attributes.find(a =>
        a.name.toLowerCase().includes('color') || a.name === 'Pa_selecciona-el-color'
      )?.value.toLowerCase();

      const vSize = variation.attributes.find(a =>
        a.name.toLowerCase().includes('talla') || a.name === 'Pa_selecciona-una-talla'
      )?.value.toLowerCase();

      const matchesColor = !color || vColor === color.toLowerCase();
      const matchesSize = !size || vSize === size.toLowerCase();

      return matchesColor && matchesSize;
    });
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: product.prices.currency_code,
      minimumFractionDigits: 0
    }).format(parseInt(price) / (10 ** product.prices.currency_minor_unit));
  };

  const isSelectionComplete = selectedColor && (!hasSize || selectedSize);

  const handleAddToCart = () => {
    if (!selectedColor) {
      alert('Por favor, selecciona un color.');
      return false;
    }
    if (hasSize && !selectedSize) {
      alert('Por favor, selecciona una talla.');
      return false;
    }

    const cartItem = {
      id: product.id,
      name: product.name,
      price: parseInt(product.prices.price) / (10 ** product.prices.currency_minor_unit),
      color: selectedColor,
      size: selectedSize,
      quantity: quantity,
      image: filteredImages[0]?.src || product.images[0]?.src
    };

    const cart = JSON.parse(localStorage.getItem('wh_cart') || '[]');
    const existingItemIndex = cart.findIndex((item: any) =>
      item.id === cartItem.id && item.color === cartItem.color && item.size === cartItem.size
    );

    if (existingItemIndex > -1) {
      cart[existingItemIndex].quantity += quantity;
    } else {
      cart.push(cartItem);
    }

    localStorage.setItem('wh_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cart-updated'));
    window.dispatchEvent(new Event('open-cart-drawer'));
    return true;
  };

  const handleAddBothToCart = () => {
    const itemsToAdd: any[] = [];

    // Main product if selected
    if (selectedFbtIds.includes(product.id)) {
      if (!selectedColor) {
        alert('Por favor, selecciona un color para el producto principal.');
        return;
      }
      if (hasSize && !selectedSize) {
        alert('Por favor, selecciona una talla para el producto principal.');
        return;
      }
      itemsToAdd.push({
        id: product.id,
        name: product.name,
        price: parseInt(product.prices.price) / (10 ** product.prices.currency_minor_unit),
        color: selectedColor,
        size: selectedSize,
        quantity: quantity,
        image: filteredImages[0]?.src || product.images[0]?.src
      });
    }

    // FBT products if selected
    if (product.fbt_products) {
      product.fbt_products.forEach((p) => {
        if (selectedFbtIds.includes(p.id)) {
          itemsToAdd.push({
            id: p.id,
            name: p.name,
            price: parseInt(p.prices.price) / (10 ** p.prices.currency_minor_unit),
            color: null,
            size: null,
            quantity: 1,
            image: p.images[0]?.src
          });
        }
      });
    }

    if (itemsToAdd.length === 0) {
      alert('Por favor, selecciona al menos un producto del complemento.');
      return;
    }

    const cart = JSON.parse(localStorage.getItem('wh_cart') || '[]');

    itemsToAdd.forEach(newItem => {
      const existingItemIndex = cart.findIndex((item: any) =>
        item.id === newItem.id && item.color === newItem.color && item.size === newItem.size
      );

      if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += newItem.quantity;
      } else {
        cart.push(newItem);
      }
    });

    localStorage.setItem('wh_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cart-updated'));
    window.dispatchEvent(new Event('open-cart-drawer'));
  };

  const fbtTotalPrice = useMemo(() => {
    let total = 0;
    if (selectedFbtIds.includes(product.id)) {
      total += parseInt(product.prices.price);
    }
    if (product.fbt_products) {
      product.fbt_products.forEach((p) => {
        if (selectedFbtIds.includes(p.id)) {
          total += parseInt(p.prices.price);
        }
      });
    }
    return total;
  }, [product, product.fbt_products, selectedFbtIds]);

  // Se elimina toggleFbtStatus ya que usaremos ProductCard directamente
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    const newIndex = Math.round(scrollLeft / width);
    if (newIndex !== activeImageIndex) setActiveImageIndex(newIndex);
  };

  return (
    <div className="product-detail">
      <div className="product-detail-split">
        <div className="product-gallery-container" id="main-gallery">
          <div className="product-gallery" onScroll={handleScroll} ref={galleryRef}>
            {/* 1. Main Carousel: Renders confirmed images from filteredImages */}
            {filteredImages.map((img, index) => (
              <div key={img.id || index} className="gallery-item">
                <picture>
                  <img
                    src={img.src}
                    alt={img.alt || product.name}
                    className="reveal-on-scroll is-visible cursor-zoom"
                    loading={index === 0 ? "eager" : "lazy"}
                    onClick={() => openLightbox(index)}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null;
                      const currentSrc = target.src;

                      // 1. Si es .webp, quitar .webp para volver al formato original (ej: .jpg.webp → .jpg)
                      if (currentSrc.toLowerCase().endsWith('.webp')) {
                        const originalSrc = currentSrc.replace(/\.webp$/i, '');
                        target.onerror = () => {
                          target.onerror = null;
                          target.src = 'https://via.placeholder.com/1200x1200?text=Winston+%26+Harry';
                        };
                        target.src = originalSrc;
                        return;
                      }

                      // 2. Limpiar sufijo de edición WordPress (-e123...)
                      const cleanSrc = currentSrc.replace(/-e\d+(?=\.(jpg|jpeg|png))/i, '');
                      if (cleanSrc !== currentSrc) {
                        target.src = cleanSrc;
                        return;
                      }

                      // 3. Último recurso: placeholder
                      target.src = 'https://via.placeholder.com/1200x1200?text=Winston+%26+Harry';
                    }}
                  />
                </picture>
              </div>
            ))}

            {/* Smart Gallery Expansion: Intentamos completar la galería dinámicamente */}
            {GUESSED_PHOTO_RANGE.map(num => {
              const firstImg = filteredImages[0];
              if (!firstImg?.src) return null;

              // Solo intentar si cumple el patrón -1 o _1
              const match = firstImg.src.match(/[-_]1(?:-e\d+)?\.(jpg|jpeg|png|webp)$/i);
              if (!match) return null;

              const guessedSrc = firstImg.src.replace(/([-_])1(?:-e\d+)?(\.(?:jpg|jpeg|png|webp))$/i, `$1${num}$2`);

              // Evitamos duplicados si la imagen ya está en las iniciales de WooCommerce
              const alreadyExists = filteredImages.some(img => img.src && (img.src === guessedSrc || img.src.includes(guessedSrc.split('/').pop() || '')));
              if (alreadyExists) return null;

              return (
                <div key={`guessed-${num}`} className="gallery-item">
                  <picture>
                    <img
                      src={guessedSrc}
                      alt={`${product.name} vista ${num}`}
                      className="reveal-on-scroll is-visible cursor-zoom"
                      loading="lazy"
                      onClick={() => {
                        const verifiedIndex = verifiedGuessedImages.indexOf(guessedSrc);
                        if (verifiedIndex !== -1) {
                          openLightbox(filteredImages.length + verifiedIndex);
                        }
                      }}
                      onLoad={() => handleGuessedImageLoad(guessedSrc)}
                      onError={(e) => {
                        // Si la foto no existe en WooCommerce, ocultamos este slide
                        const target = e.target as HTMLImageElement;
                        const container = target.closest('.gallery-item') as HTMLElement;
                        if (container) container.style.display = 'none';
                      }}
                    />
                  </picture>
                </div>
              );
            })}
          </div>

          {getGalleryCount() > 1 && (
            <div className="gallery-dots">
              {Array.from({ length: getGalleryCount() }).map((_, i) => (
                <button
                  key={`dot-${i}`}
                  className={`dot ${i === activeImageIndex ? 'active' : ''}`}
                  onClick={() => slideTo(i)}
                  aria-label={`Ir a imagen ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="product-info-sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-content">
              <div className="breadcrumb-wrapper">
                <div className="product-breadcrumbs">
                  <a href="/">Inicio</a>
                  <span className="separator">/</span>
                  {mainCategory && (
                    <>
                      <a href="/#tienda">{mainCategory.name}</a>
                      <span className="separator">/</span>
                    </>
                  )}
                  <span className="current">{product.name}</span>
                </div>
                <button
                  className={`detail-favorite-btn ${isFavorite ? 'active' : ''}`}
                  onClick={toggleFavorite}
                  aria-label={isFavorite ? "Eliminar de favoritos" : "Añadir a favoritos"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </button>
              </div>


              <h1 className="product-title">{product.name}</h1>
              <p className="product-price">{formatPrice(product.prices.price)}</p>

              <div className="product-short-description" dangerouslySetInnerHTML={{ __html: product.short_description }} />

              <div className="product-selectors">
                {colorAttribute && (
                  <div className="selector-group">
                    <label>Color: <strong>{colorAttribute.terms.find(t => t.slug === selectedColor)?.name || ''}</strong></label>
                    <div className="color-options">
                      {colorAttribute.terms.map((term) => {
                        const isAvailable = isCombinationAvailable(term.slug, null);
                        return (
                          <button
                            key={term.id}
                            className={`color-dot-btn ${selectedColor === term.slug ? 'active' : ''} ${!isAvailable ? 'out-of-stock' : ''}`}
                            onClick={() => setSelectedColor(term.slug)}
                          >
                            <span className="color-dot" style={{ backgroundColor: getColorCode(term.slug) }}></span>
                            {!isAvailable && <span className="x-mark">✕</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasSize && (
                  <div className="selector-group">
                    <div className="label-row-between">
                      <label>Talla: <strong>{sizeAttribute?.terms.find(t => t.slug === selectedSize)?.name || ''}</strong></label>
                      <button className="size-guide-dark" onClick={() => setShowSizeGuide(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"></path>
                          <path d="m14.5 12.5 2-2"></path>
                          <path d="m11.5 9.5 2-2"></path>
                          <path d="m8.5 6.5 2-2"></path>
                          <path d="m17.5 15.5 2-2"></path>
                        </svg>
                        <span>GUÍA DE TALLAS</span>
                      </button>
                    </div>
                    <div className="size-options">
                      {sizeAttribute.terms.map((term) => {
                        const isAvailable = isCombinationAvailable(selectedColor, term.slug);
                        return (
                          <button
                            key={term.id}
                            className={`size-box-btn ${selectedSize === term.slug ? 'active' : ''} ${!isAvailable ? 'out-of-stock' : ''}`}
                            onClick={() => isAvailable && setSelectedSize(term.slug)}
                          >
                            {term.name}
                            {!isAvailable && <span className="x-mark">✕</span>}
                          </button>
                        );
                      })}
                    </div>
                    {currentSizeInfo && (
                      <div className="selected-size-info-box">
                        <p>
                          El tamaño etiquetado en el artículo es <strong>{currentSizeInfo.wh}</strong>, igual que <strong>US {currentSizeInfo.us}</strong> y <strong>EU {currentSizeInfo.eu}</strong>
                          <span className="size-length-detail"> (Largo del pie: <strong>{currentSizeInfo.cm} cm</strong>)</span>.
                        </p>
                      </div>
                    )}
                    <div className="size-help-link">
                      <span>¿No encuentras tu talla? </span>
                      <a href="#" target="_blank" rel="noopener noreferrer">Te ayudamos</a>
                    </div>
                  </div>
                )}
              </div>

              <div className="product-purchase-row">
                <div className="quantity-selector-container">
                  <label>Cantidad:</label>
                  <div className="quantity-controls">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                    <span>{quantity}</span>
                    <button onClick={() => setQuantity(quantity + 1)}>+</button>
                  </div>
                </div>

                <div className="product-actions-grid">
                  <button
                    className="btn-action btn-fill"
                    onClick={handleAddToCart}
                  >
                    Añadir al Carrito
                  </button>
                  <button
                    className="btn-action btn-outline-thick"
                    onClick={() => {
                      if (handleAddToCart()) {
                        window.location.href = '/checkout';
                      }
                    }}
                  >
                    Comprar Ahora
                  </button>
                </div>
              </div>

              <div className="addi-container">
                <div className="addi-content">
                  <img src="https://framerusercontent.com/images/z1k7Q8vHsCRiRHF6UqTSfumiSHU.svg" alt="Addi" className="addi-icon" />
                  <span className="addi-text">
                    Paga con <span className="addi-brand">Addi</span> en <strong>hasta 6 cuotas</strong>.
                    <a href="https://co.addi.com/" target="_blank" rel="noopener noreferrer" className="addi-link">Pide un cupo</a>
                  </span>
                </div>
              </div>

              <div className="product-details-dropdowns">
                <details open>
                  <summary>Descripción y Detalles</summary>
                  <div className="dropdown-inner" dangerouslySetInnerHTML={{ __html: product.description }} />
                </details>
                <details>
                  <summary>Información adicional</summary>
                  <div className="dropdown-inner">
                    <div className="additional-info-container">
                      {product.attributes && product.attributes.length > 0 ? (
                        product.attributes.map((attr) => {
                          let displayName = attr.name;
                          if (displayName.toLowerCase().includes('selecciona el color')) displayName = 'Color';
                          if (displayName.toLowerCase().includes('selecciona una talla')) displayName = 'Tallas';

                          return (
                            <div key={attr.id} className="additional-info-row">
                              <span className="info-label">{displayName}</span>
                              <span className="info-value">
                                {attr.terms.map(t => t.name).join(' , ')}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="no-info">No hay información adicional disponible.</p>
                      )}
                    </div>
                  </div>
                </details>
                <details>
                  <summary>Envío y Cambios</summary>
                  <div className="dropdown-inner">
                    <p>Entrega estándar gratuita en todos los pedidos. Cambios disponibles dentro de los 15 días.</p>
                  </div>
                </details>
              </div>
              <div className="store-locator-container">
                <a href="#" className="store-locator-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Clic AQUÍ para buscar una tienda cerca de ti
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN EL COMPLEMENTO IDEAL (Uso de ProductCard para consistencia) */}
      {product.fbt_products && product.fbt_products.length > 0 && (
        <section className="fbt-new-section">
          <div className="fbt-fullwidth-container">
            <h2 className="fbt-title-premium">El Complemento Ideal</h2>
            <div className="fbt-bundle-grid">
              <div className="fbt-visual-row">
                <div className="fbt-bundle-step">
                  <div className="fbt-card-isla">
                    <ProductCard
                      product={product}
                      isSelected={selectedFbtIds.includes(product.id)}
                      onSelectionToggle={toggleFbtSelection}
                    />
                  </div>
                </div>

                {product.fbt_products.map((p, idx) => (
                  <div key={p.id} className="fbt-bundle-step">
                    <span className="fbt-math-plus">+</span>
                    <div className="fbt-card-isla">
                      <ProductCard
                        product={p}
                        isSelected={selectedFbtIds.includes(p.id)}
                        onSelectionToggle={toggleFbtSelection}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="fbt-action-card">
                <div className="fbt-total-row">
                  <span className="label">Total por los seleccionados:</span>
                  <span className="value">{formatPrice(fbtTotalPrice.toString())}</span>
                </div>
                <button
                  className="fbt-submit-btn"
                  onClick={handleAddBothToCart}
                >
                  Añadir seleccionados al carrito
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECCIÓN COMPLETA TU LOOK (Premium Related Products) */}
      {product.related_products && product.related_products.length > 0 && (
        <section className="related-products-section">
          <div className="related-section-header">
            <h2 className="fbt-title-premium">COMPLETA TU LOOK</h2>
          </div>
          <div className="related-grid">
            {product.related_products.map((item: any) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      {lightboxOpen && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <button className="lightbox-close" onClick={closeLightbox}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>

          <button className="lightbox-nav prev" onClick={prevImage}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>

          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div
              className="lightbox-slider"
              style={{ transform: `translateX(-${lightboxIndex * 100}%)` }}
            >
              {galleryDOMImages.map((img, i) => (
                <div key={i} className="lightbox-slide">
                  <div className="lightbox-image-wrapper" onMouseMove={handleMouseMove} onTouchMove={handleTouchMove}>
                    <img
                      src={img.src}
                      alt={img.alt}
                      className={`lightbox-img ${isZoomed && lightboxIndex === i ? 'zoomed' : ''}`}
                      style={isZoomed && lightboxIndex === i ? { transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`, transform: 'scale(2)' } : {}}
                      onDragStart={(e) => e.preventDefault()}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="lightbox-nav next" onClick={nextImage}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>

          <button className="lightbox-zoom-indicator" onClick={toggleZoom}>
            {isZoomed ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M8 11h6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" /></svg>
            )}
          </button>
        </div>
      )}

      {showSizeGuide && (
        <div className="size-guide-modal-overlay" onClick={() => setShowSizeGuide(false)}>
          <div className="size-guide-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSizeGuide(false)}>✕</button>
            <h2>Guía de Tallas</h2>
            <div className="table-responsive">
              <table className="size-guide-table">
                <thead>
                  <tr>
                    <th>COLOMBIA</th>
                    <th>WINSTON & HARRY</th>
                    <th>US</th>
                    <th>UK</th>
                    <th>EUROPA</th>
                    <th>PIE (CM)</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE_DATA.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .product-detail { background: #fff; width: 100%; }

        .product-breadcrumbs {
            margin-bottom: 2rem;
            font-size: 0.8rem;
            color: #777;
            font-family: var(--font-paragraphs);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 0;
        }
        .breadcrumb-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0rem;
            gap: 1rem;
        }
        .detail-favorite-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            color: #999;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .detail-favorite-btn:hover {
            color: #d62828;
            transform: scale(1.1);
        }
        .detail-favorite-btn.active {
            color: #d62828;
        }
        .product-breadcrumbs a {
            color: #708090;
            transition: color 0.2s;
        }
        .product-breadcrumbs a:hover {
            color: var(--color-beige);
        }
        .product-breadcrumbs .separator {
            color: #ddd;
        }
        .product-breadcrumbs .current {
            color: #121212;
            font-weight: 500;
        }

        .product-detail-split { display: flex; flex-direction: row; align-items: stretch; }
        .product-gallery-container { width: 50%; position: relative; }
        .product-gallery { display: flex; flex-direction: column; background: #f8f8f8; }
        .gallery-item img { width: 100%; height: auto; display: block; object-fit: cover; }
        .gallery-nav { display: none; }

        .gallery-dots {
            display: none;
            justify-content: center;
            gap: 8px;
            position: absolute;
            bottom: 20px;
            left: 0;
            right: 0;
            z-index: 50;
            pointer-events: none;
        }
        .dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.5);
            padding: 0;
            cursor: pointer;
            transition: all 0.3s;
            pointer-events: auto;
        }
        .dot.active { background: #000; transform: scale(1); border-color: #000; }

        .product-info-sidebar { width: 50%; background: #fff; position: relative; }

        .sidebar-inner { padding: 2rem 10% 5rem; height: 100%; }
        .sidebar-content {
            position: sticky;
            top: 20px;
            max-height: calc(100vh - 40px);
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
            padding-right: 5px; /* Prevent content jump */
        }
        .sidebar-content::-webkit-scrollbar { display: none; }
        .product-category { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 0rem; }
        .product-title { font-family: var(--font-products); font-size: 1.5rem; color: #000; margin-bottom: 0rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 500; }
        .product-price { font-size: 1.8rem; color: #A98B68; margin-bottom: 0rem; font-weight: 400;}

        .product-purchase-row {
            display: flex;
            align-items: flex-end;
            gap: 1rem;
            margin: 1rem 0 0rem;
        }
        .quantity-selector-container {
            display: flex;
            align-items: center;
            gap: 0.8rem;
        }
        .quantity-selector-container label {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #888;
            white-space: nowrap;
        }
        .quantity-controls {
            display: flex;
            align-items: center;
            border: 1px solid #eee;
            border-radius: 2px;
            overflow: hidden;
            background: #fff;
        }
        .quantity-controls button {
            background: none;
            border: none;
            width: 32px;
            height: 32px;
            cursor: pointer;
            font-size: 1.1rem;
            color: #121212;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .quantity-controls button:hover {
            background: #f9f9f9;
        }
        .quantity-controls span {
            width: 40px;
            text-align: center;
            font-size: 0.9rem;
            font-weight: 600;
        }

        .product-actions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          flex: 1;
        }
        .btn-action { padding: 0.8rem 0.5rem; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.3s; border-radius: 2px; font-family: var(--font-paragraphs); border: 1.5px solid var(--color-green); }
        .btn-fill { background-color: var(--color-green); color: #fff; }
        .btn-outline-thick { background-color: #fff; color: var(--color-green); border: 1px solid var(--color-green) !important; }
        .btn-action:hover:not(.disabled) { opacity: 0.8; transform: translateY(-2px); }
        .btn-action.disabled { background-color: #eee; border-color: #eee; color: #999; cursor: not-allowed; }
        .product-short-description { font-size: 0.85rem; color: #555; line-height: 1.7; margin-bottom: 0.5rem; }
        .selector-group { margin-bottom: 0.5rem; }
        .selector-group label { display: block; font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 0px; letter-spacing: 1px; }
        .label-row-between { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0rem; }
        .color-dot-btn { background: none; border: none; padding: 4px; cursor: pointer; border: 1px solid transparent; border-radius: 50%; transition: all 0.2s; position: relative; }
        .color-dot-btn.active { border-color: #000; }
        .color-dot-btn.out-of-stock { opacity: 0.4; }
        .color-dot { display: block; width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.05); }
        .size-options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .size-box-btn { min-width: 30px; height: 30px; border: 1px solid #eee; background: #fff; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; border-radius: 2px; position: relative; color: #121212; }
        .size-box-btn.active { background: #000; color: #fff; border-color: #000; }
        .size-box-btn.out-of-stock { background-color: #fcfcfc; color: #ddd; border-color: #f1f1f1; }
        .size-guide-dark { background: none; border: none; color: #000; font-weight: 700; cursor: pointer; font-size: 0.7rem; letter-spacing: 1px; text-transform: uppercase; padding: 0; display: flex; align-items: center; gap: 6px; }
        .size-guide-dark span { text-decoration: underline; }
        .dropdown-inner{padding: 5px;}
        .selected-size-info-box {
            margin-top: 0.5rem;
            padding: 1rem;
            background-color: #f8f8f8;
            border-radius: 4px;
            font-size: 0.85rem;
            line-height: 1.6;
            color: #333;
            animation: fadeIn 0.3s ease-out;
        }
        .selected-size-info-box p { margin: 0; }
        .selected-size-info-box strong { color: #A98B68; }
        .size-length-detail { color: #666; font-size: 0.8rem; }
        .size-help-link { margin-top: 0.8rem; font-size: 0.8rem; color: #555; }
        .size-help-link a { color: var(--color-green); text-decoration: underline; font-weight: 600; }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .size-guide-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .size-guide-modal-content { background: #fff; padding: 3rem; max-width: 850px; width: 100%; position: relative; border-radius: 4px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .modal-close { position: absolute; top: 15px; right: 15px; background: #f5f5f5; border: none; font-size: 1.2rem; cursor: pointer; color: #333; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; transition: background 0.2s; }
        .modal-close:hover { background: #eee; }
        .size-guide-modal-content h2 { font-family: var(--font-products); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 2rem; text-align: center; color: var(--color-green); font-size: 1.5rem; }

        .table-responsive {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border: 1px solid #eee;
            border-radius: 4px;
        }

        .size-guide-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; min-width: 500px; }
        .size-guide-table th { background: #f9f9f9; padding: 1rem 0.5rem; text-align: center; font-weight: 700; color: var(--color-green); font-family: var(--font-products); border-bottom: 2px solid #eee; white-space: nowrap; }
        .size-guide-table td { padding: 1rem 0.5rem; text-align: center; border-bottom: 1px solid #eee; color: #666; }

        @media (max-width: 768px) {
            .size-guide-modal-content { padding: 2.5rem 1rem 1.5rem; }
            .size-guide-modal-content h2 { font-size: 1.2rem; margin-bottom: 1.5rem; }
            .size-guide-table { font-size: 0.75rem; }
            .size-guide-table th, .size-guide-table td { padding: 0.8rem 1rem; }
        }
        .product-details-dropdowns { margin-top: 0.5rem;}
        .product-details-dropdowns details{ border-top: 1px solid #eee; border-bottom: 1px solid #eee;}
        summary { list-style: none; padding: 0.5rem 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        summary::after { content: '+'; color: #999; font-size: 1.2rem; font-weight: 300; }
        details[open] summary::after { content: '−'; }

        .additional-info-container {
            display: flex;
            flex-direction: column;
            width: 100%;
        }
        .additional-info-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            padding: 1rem 0;
            border-bottom: 1px dotted #e5e5e5;
            gap: 2rem;
        }
        .additional-info-row:last-child {
            border-bottom: none;
        }
        .info-label {
            color: #000; /* Cambiado de verde a negro */
            font-size: 0.85rem;
            font-weight: 500;
            white-space: nowrap;
        }
        .info-value {
            color: #777;
            font-size: 0.85rem;
            text-align: right;
            line-height: 1.4;
        }
        .no-info {
            font-size: 0.8rem;
            color: #999;
            font-style: italic;
        }

        @media (max-width: 992px) {
          .product-breadcrumbs { margin-top: 0; margin-bottom: 1.5rem; font-size: 0.75rem; }
          .product-detail-split { display: block; position: relative; }
          .product-gallery-container {
            width: 100%;
            position: sticky !important;
            top: 65px !important;
            aspect-ratio: 1 / 1;
            z-index: 1;
            background: #f8f8f8;
          }
          .gallery-dots {
             display: flex;
             bottom: 50px; /* Lift dots above the overlapping sidebar on mobile */
          }
          .product-gallery {
            flex-direction: row;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scrollbar-width: none;
            height: 100%;
            -webkit-overflow-scrolling: touch;
          }
          .gallery-item {
            flex: 0 0 100%;
            scroll-snap-align: center;
            height: 100%;
          }
          .gallery-item img {
            height: 100%;
            width: 100%;
            object-fit: cover;
          }
          .gallery-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.8);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 5;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .gallery-nav.prev { left: 15px; }
          .gallery-nav.next { right: 15px; }

          .product-info-sidebar {
            width: 100%;
            position: relative !important;
            z-index: 10;
            background: #fff;
            margin-top: -30px;
            border-radius: 0px;
            box-shadow: 0 -15px 30px rgba(0,0,0,0.08);
          }
          .sidebar-inner { padding: 2.5rem 1.5rem 5rem; }
          .sidebar-content {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
          }

          .product-actions-grid { grid-template-columns: 1fr 1fr; }
          .product-purchase-row {
            flex-direction: column;
            align-items: stretch;
            gap: 1.5rem;
          }
          .quantity-selector-container {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }


        .addi-container {
            margin-top: 0.5rem;
            margin-bottom: 0rem;
            padding: 8px 0px;
            display: flex;
            align-items: center;
            background-color: #fff;
            transition: all 0.3s;
        }
        .addi-container:hover {
            border-color: #0068ff;
            box-shadow: 0 2px 8px rgba(0, 104, 255, 0.1);
        }
        .addi-content {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.8rem;
            color: #333;
            width: 100%;
            flex-wrap: wrap;
        }
        .addi-icon {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
            border-radius: 6px;
        }
        .addi-brand {
            color: #0068ff;
            font-weight: 800;
        }
        .addi-text {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
        }
        .addi-text strong {
            font-weight: 700;
        }
        .addi-link {
            color: #0068ff;
            text-decoration: underline;
            margin-left: 2px;
            white-space: nowrap;
             font-weight: 600;
             cursor: pointer;
        }
        @media (max-width: 480px) {
            .addi-content { gap: 8px; font-size: 0.75rem; }
            .addi-icon { width: 20px; height: 20px; }
        }

        @media (max-width: 992px) {
            .addi-container { margin-top: 0.5rem; }
        }

        .store-locator-container {
            margin-top: 0.5rem;
            padding-top: 0.5rem;        }
        .store-locator-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #121212;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
            text-decoration: none;
            transition: color 0.2s;
        }
        .store-locator-link svg {
            color: var(--color-green);
        }
        .store-locator-link:hover {
            color: var(--color-green);
            text-decoration: underline;
        }

        /* Lightbox Styles (Global) */
        .cursor-zoom { cursor: zoom-in; }
        .lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.9); /* Gris claro semitransparente como referencia */
          backdrop-filter: blur(2px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease-out;
        }

        /* Botones Flotantes Circulares */
        .lightbox-close,
        .lightbox-nav,
        .lightbox-zoom-indicator {
          background: #fff;
          border: none;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #121212;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
          position: absolute;
          z-index: 10002;
        }

        .lightbox-close {
          top: 25px;
          right: 25px;
        }

        .lightbox-nav.prev {
          left: 25px;
          top: 50%;
          transform: translateY(-50%);
        }

        .lightbox-nav.next {
          right: 25px;
          top: 50%;
          transform: translateY(-50%);
        }

        .lightbox-zoom-indicator {
          bottom: 25px;
          left: 25px;
          pointer-events: auto; /* Ensure clickable */
        }

        .lightbox-close:hover,
        .lightbox-nav:hover {
          transform: translateY(-50%) scale(1.1);
          box-shadow: 0 6px 16px rgba(0,0,0,0.15);
        }
        .lightbox-close:hover {
           transform: scale(1.1); /* Close button doesn't have translateY center */
        }

        .lightbox-content {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
          pointer-events: none;
        }

        .lightbox-slider {
          display: flex;
          height: 100%;
          width: 100%;
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform;
          pointer-events: none;
        }

        .lightbox-slide {
          flex: 0 0 100%;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .lightbox-image-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
        }

        .lightbox-img {
          max-width: 100vw;
          max-height: 100vh;
          object-fit: contain;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          background: #fff;
          transition: transform 0.2s ease-out;
        }

        .lightbox-img.zoomed {
            cursor: zoom-out;
            max-width: none;
            max-height: none;
            /* width: 100%; height: 100%; controlled by transform */
        }

        @media (max-width: 768px) {
            .lightbox-img {
                max-width: 100vw;
                max-height: 80vh;
            }
            .lightbox-nav, .lightbox-zoom-indicator {
                width: 25px;
                height: 25px;
            }
            .lightbox-nav.prev { left: 10px; }
            .lightbox-nav.next { right: 10px; }
            .lightbox-close { top: 15px; right: 15px; width: 36px; height: 36px; }
            .lightbox-zoom-indicator { bottom: 15px; left: 15px; }
        }

        /* --- FBT PREMIUM NEW SECTION --- */
        .fbt-new-section {
          padding: 2rem 0;
          background-color: #f9f9f9;
          border-top: 1px solid #12121208;
          width: 100vw;
          margin-left: calc(50% - 50vw);
          position: relative;
        }
        .fbt-fullwidth-container {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 4rem;
        }
        .fbt-title-premium {
          font-family: var(--font-products);
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--color-green);
          margin-bottom: 2rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          text-align: center;
        }
        .fbt-bundle-grid {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 4rem;
          width: 100%;
        }
        .fbt-visual-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
        }
        .fbt-bundle-step {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
        }
        .fbt-math-plus {
          font-size: 2.5rem;
          color: #155338;
          font-weight: 300;
          margin-top: -60px; /* Centrado respecto a las cards */
        }
        .fbt-card-isla {
          width: 320px;
          background: #fff;
          transition: transform 0.4s ease;
        }
        .fbt-card-isla:hover {
          transform: translateY(-5px);
        }

        .fbt-action-card {
          background: #fbfbfb;
          padding: 2.5rem;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
          min-width: 300px;
          border: 1px solid #f0f0f0;
        }
        .fbt-total-row {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .fbt-total-row .label { font-size: 0.8rem; color: #777; text-transform: uppercase; letter-spacing: 1px; }
        .fbt-total-row .value { font-size: 1.6rem; color: var(--color-green); font-family: var(--font-paragraph); font-weight: 500; }
        
        .fbt-submit-btn {
          background: var(--color-green);
          color: #fff;
          border: none;
          padding: 1.2rem;
          font-family: var(--font-headings);
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .fbt-submit-btn:hover:not(:disabled) {
          background: var(--color-beige);
          transform: translateY(-2px);
        }
        .fbt-submit-btn:disabled {
          background: #eee;
          color: #aaa;
          cursor: not-allowed;
        }
        .fbt-note {
          font-size: 0.75rem;
          color: #999;
          margin: 0;
          font-style: italic;
        }

        @media (max-width: 1100px) {
          .fbt-bundle-grid { flex-direction: column; gap: 3rem; }
          .fbt-action-card { width: 100%; max-width: 500px; min-width: 0; padding: 2rem; }
        }

        @media (max-width: 600px) {
            .fbt-new-section { padding: 2rem 0; }
            .fbt-fullwidth-container { padding: 0 1.5rem; }
            .fbt-visual-row { gap: 1rem; width: 100%; }
            .fbt-bundle-step { gap: 1rem; }
            .fbt-card-isla { width: 100%; min-width: 0; }
            .fbt-math-plus { font-size: 1.2rem; margin-top: -30px; display: none;}
            .fbt-item-name { font-size: 0.7rem; }
            .fbt-action-card { padding: 1.5rem; }
            .fbt-title-premium { margin-bottom: 2rem; }
        }

        /* --- STYLES FOR RELATED PRODUCTS (PREMIUM) --- */
        .related-products-section {
          padding: 2rem 0;
          background-color: #fcfcfc;
          border-top: 1px solid #eee;
          margin-top: 0rem;
        }
        .related-section-header {
          text-align: center;
          margin: 0rem 0rem;
        }
        .related-title {
          font-size: 1.5rem;
          color: var(--color-green);
          font-family: var(--font-headings);
          font-weight: 500;
        }
        .related-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0rem;
          width: 100%;
          margin: 0 auto;
        }

        @media (max-width: 992px) {
          .related-grid { grid-template-columns: repeat(2, 1fr); }
          .related-products-section { padding: 2rem 0; }
        }
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
    'vino tinto': '#722F37',
    'burgundy': '#722F37',
    'tabaco': '#8B5A2B',
    'cognac': '#9A463D',
    'rojo': '#C41E3A',
    'beige': '#F5F5DC'
  };
  return colors[slug.toLowerCase()] || '#ddd';
}

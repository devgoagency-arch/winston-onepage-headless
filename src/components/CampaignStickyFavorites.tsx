import { useState, useEffect, useMemo } from 'react';
import ProductCard from './ProductCard';
import { MENU_CATEGORIES, EXCLUDED_SLUGS } from '../lib/menuCategories';

interface Product {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  prices: any;
  images: { src: string; alt: string; }[];
  categories?: { id: number; name: string; slug: string }[];
  attributes: any[];
  variations: any[];
  variation_images_map?: Record<string, any[]>;
}

const CATEGORIES = [
    { id: 'all', name: 'Todos los Regalos', shortName: 'Todos', slug: 'tienda' },
    { id: '921', name: 'Regalos menos de $350K', shortName: '-$300k', slug: 'menos-de-350000', maxPrice: 300000 },
    { id: '955', name: 'Suéteres y Chalecos', shortName: 'Suéteres', slug: 'sueteres-chalecos-hombre' },
    { id: '63', name: 'Zapatos', shortName: 'Zapatos', slug: 'zapatos-cuero-hombre' },
    { id: '190', name: 'Maletas', shortName: 'Maletas', slug: 'maletas-morrales-cuero' },
    { id: '249', name: 'Ropa', shortName: 'Ropa', slug: 'ropa-hombre-colombia' }
];

const SORT_OPTIONS = [
  { key: "destacado", label: "Destacado" },
  { key: "precio_asc", label: "Menor a mayor precio" },
  { key: "precio_desc", label: "Mayor a menor precio" },
  { key: "descuentos", label: "Descuentos" }
];

function getProductMainCategoryOrderIndex(product: any): number {
  if (!product.categories || !Array.isArray(product.categories)) return 999;
  
  const slugs = product.categories.map((c: any) => c.slug.toLowerCase());
  const names = product.categories.map((c: any) => c.name.toLowerCase());
  const ids = product.categories.map((c: any) => String(c.id));
  
  // 1. Zapatos
  const isZapato = ids.includes('63') || 
                   slugs.some(s => s.includes('zapato') || s.includes('calzado') || s.includes('mocas') || s.includes('tenis') || s.includes('oxford') || s.includes('derby') || s.includes('bota')) ||
                   names.some(n => n.includes('zapato') || n.includes('calzado') || n.includes('mocas') || n.includes('tenis') || n.includes('oxford') || n.includes('derby') || n.includes('bota'));
  if (isZapato) return 1;
  
  // 2. Ropa
  const isRopa = ids.includes('249') || ids.includes('955') ||
                 slugs.some(s => s.includes('ropa') || s.includes('sueter') || s.includes('suéter') || s.includes('chaqueta') || s.includes('pantalon') || s.includes('chaleco') || s.includes('camisa') || s.includes('camiseta')) ||
                 names.some(n => n.includes('ropa') || n.includes('sueter') || n.includes('suéter') || n.includes('chaqueta') || n.includes('pantalon') || n.includes('chaleco') || n.includes('camisa') || n.includes('camiseta'));
  if (isRopa) return 2;
  
  // 3. Maletas y morrales
  const isMaleta = ids.includes('190') ||
                   slugs.some(s => s.includes('maleta') || s.includes('morral') || s.includes('portafolio') || s.includes('neceser') || s.includes('bolso') || s.includes('canguro') || s.includes('viaje')) ||
                   names.some(n => n.includes('maleta') || n.includes('morral') || n.includes('portafolio') || n.includes('neceser') || n.includes('bolso') || n.includes('canguro') || n.includes('viaje'));
  if (isMaleta) return 3;
  
  // 4. Accesorios
  const isAccesorio = slugs.some(s => s.includes('accesorio') || s.includes('billetera') || s.includes('correa') || s.includes('cinturon') || s.includes('cinturón') || s.includes('llavero') || s.includes('tarjetero') || s.includes('monedero')) ||
                      names.some(n => n.includes('accesorio') || n.includes('billetera') || n.includes('correa') || n.includes('cinturon') || n.includes('cinturón') || n.includes('llavero') || n.includes('tarjetero') || n.includes('monedero'));
  if (isAccesorio) return 4;
  
  // 5. Collares para perro
  const isCollar = slugs.some(s => s.includes('collar') || s.includes('perro') || s.includes('mascota') || s.includes('canino')) ||
                   names.some(n => n.includes('collar') || n.includes('perro') || n.includes('mascota') || n.includes('canino'));
  if (isCollar) return 5;
  
  return 999;
}

export default function CampaignStickyFavorites({ 
  initialProducts = [], 
  initialCache = null 
}: { 
  initialProducts?: Product[]; 
  initialCache?: Record<string | number, Product[]> | null;
}) {
  const defaultCache = initialCache || { 'all': initialProducts };
  const defaultProducts = initialCache ? (initialCache['all'] || []) : initialProducts;

  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [categoryCache, setCategoryCache] = useState<Record<string | number, Product[]>>(defaultCache);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [loading, setLoading] = useState(!initialCache && initialProducts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [categorySlugs, setCategorySlugs] = useState<Record<string, string>>({
    '955': 'sueteres-chalecos-hombre',
    '63': 'zapatos-cuero-hombre',
    '190': 'maletas-morrales-cuero',
    '249': 'ropa-hombre-colombia',
    'all': 'tienda',
    '921': 'menos-de-350000'
  });
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  // Paginación real de API: página actual por categoría y si hay más
  const [apiPage, setApiPage] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  // Estados de Filtros Avanzados
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedTallas, setSelectedTallas] = useState<string[]>([]);
  const [selectedSubcats, setSelectedSubcats] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 99999999]);
  const [localPriceRange, setLocalPriceRange] = useState<[string, string]>(['', '']);
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    categories: true,
    color: false,
    talla: false,
    precio: false
  });

  const toggleSubcat = (slug: string) => {
    setSelectedSubcats(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    setVisibleCount(12);
  };

  useEffect(() => {
    // Ya NO hacemos return temprano si hay initialCache, porque necesitamos
    // actualizar los 24 productos iniciales (SSR) a los 100 completos en background.

    const prefetchCategories = async () => {
      try {
        if (initialProducts.length === 0) setLoading(true);
        setError(null);

        const results = await Promise.all(
          CATEGORIES.map(async (cat) => {
            // 1. Intentar cargar el JSON estático si no es la categoría especial de precios
            let data: Product[] = [];
            let jsonSuccess = false;
            
            if (cat.id !== '921') {
              try {
                const staticUrl = `/data/catalog/${cat.slug}-all.json`;
                const staticRes = await fetch(staticUrl);
                if (staticRes.ok) {
                  data = await staticRes.json();
                  jsonSuccess = true;
                }
              } catch (e) {
                console.warn(`No se pudo cargar el JSON estático para ${cat.slug}`);
              }
            }

            // 2. Si falla o es la de precios, usar la API de Astro/WooCommerce
            if (!jsonSuccess) {
              let url = cat.id === 'all' 
                  ? `/api/products?orderby=popularity&per_page=100`
                  : `/api/products?category=${cat.id}&orderby=popularity&per_page=100`;
              
              if (cat.maxPrice) url += `&max_price=${cat.maxPrice}`;

              const res = await fetch(url);
              if (!res.ok) return { id: cat.id, data: [] };
              data = await res.json();
            }

            const seenIds = new Set<number>();
            const filteredData = data.filter(p => {
              if (seenIds.has(p.id)) return false;
              seenIds.add(p.id);
              return true;
            });

            return { id: cat.id, data: filteredData };
          })
        );

        const newCache: Record<string | number, Product[]> = {};
        results.forEach(res => { newCache[res.id] = res.data; });
        setCategoryCache(newCache);

        if (newCache[activeCategory.id]) {
          console.log('[DIAGNOSTICO] Productos en memoria (después de fetch):', newCache[activeCategory.id].length);
          setProducts(newCache[activeCategory.id]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al precargar colecciones');
      } finally {
        setLoading(false);
      }
    };
    prefetchCategories();
  }, [initialCache]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsHeaderHidden(true);
      } else {
        setIsHeaderHidden(false);
      }
      lastScrollY = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Debounce para rango de precios
  useEffect(() => {
    const handler = setTimeout(() => {
      const min = localPriceRange[0] === '' ? 0 : Number(localPriceRange[0]);
      const max = localPriceRange[1] === '' ? 99999999 : Number(localPriceRange[1]);
      if (min !== priceRange[0] || max !== priceRange[1]) {
        setPriceRange([min, max]);
        setVisibleCount(12);
      }
    }, 600);
    return () => clearTimeout(handler);
  }, [localPriceRange]);

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab: string }>;
      const tabName = customEvent.detail?.tab?.toLowerCase() || '';
      if (!tabName) return;

      // Helper function to normalize strings for comparison (removes accents)
      const normalize = (str: string) => 
        str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const normalizedTab = normalize(tabName);

      const matchedCategory = CATEGORIES.find(cat => 
        normalize(cat.shortName) === normalizedTab ||
        normalize(cat.name).includes(normalizedTab) ||
        normalize(cat.id) === normalizedTab
      );

      if (matchedCategory) {
        setActiveCategory(matchedCategory);
        setVisibleCount(12);
        
        // Resetear filtros al cambiar por evento de campaña
        setSelectedColors([]);
        setSelectedTallas([]);
        setPriceRange([0, 99999999]);
        setLocalPriceRange(['', '']);
        setSort(SORT_OPTIONS[0]);

        if (categoryCache[matchedCategory.id]) {
          setProducts(categoryCache[matchedCategory.id]);
        } else {
          fetchProducts(matchedCategory.id);
        }
        
        // Smooth scroll to the sticky filters section with offset
        setTimeout(() => {
          const element = document.getElementById('favoritos-sticky');
          if (element) {
            const bannerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--global-banner-height')) || 0;
            const headerHeight = window.innerWidth <= 768 ? 64 : 80;
            const yOffset = -(headerHeight + bannerHeight + 20); 
            const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 100);
      }
    };

    window.addEventListener('campaign-tab-changed', handleTabChange);
    
    // Check URL on mount
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('campaigntab')?.toLowerCase();
    if (initialTab) {
      const normalize = (str: string) => 
        str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const normalizedTab = normalize(initialTab);

      const matchedCategory = CATEGORIES.find(cat => 
        normalize(cat.shortName) === normalizedTab ||
        normalize(cat.name).includes(normalizedTab) ||
        normalize(cat.id) === normalizedTab
      );
      if (matchedCategory) {
        setActiveCategory(matchedCategory);
        setVisibleCount(12);
        if (categoryCache[matchedCategory.id]) {
          setProducts(categoryCache[matchedCategory.id]);
        }
      }
    }

    return () => window.removeEventListener('campaign-tab-changed', handleTabChange);
  }, [categoryCache]);

  const fetchProducts = async (categoryId: string | number, page = 1, append = false) => {
    try {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const cat = CATEGORIES.find(c => String(c.id) === String(categoryId));
      if (!cat) return;

      let data: Product[] = [];
      let jsonSuccess = false;
      
      if (cat.id !== '921') {
        try {
          const staticUrl = `/data/catalog/${cat.slug}-all.json`;
          const staticRes = await fetch(staticUrl);
          if (staticRes.ok) {
            data = await staticRes.json();
            jsonSuccess = true;
          }
        } catch (e) {
          console.warn(`No se pudo cargar el JSON estático para ${cat.slug}`);
        }
      }

      if (!jsonSuccess) {
        const PER_PAGE = 100;
        let url = cat.id === 'all'
            ? `/api/products?orderby=popularity&per_page=${PER_PAGE}`
            : `/api/products?category=${cat.id}&orderby=popularity&per_page=${PER_PAGE}`;

        if (cat.maxPrice) url += `&max_price=${cat.maxPrice}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al cargar productos');
        data = await response.json();
      }
      const seenIds = new Set<number>();
      const filteredData = data.filter(p => {
        if (seenIds.has(p.id)) return false;
        seenIds.add(p.id);
        return true;
      });

      // Si devuelve menos de PER_PAGE, no hay más páginas
      const moreAvailable = data.length >= PER_PAGE;
      setHasMore(prev => ({ ...prev, [String(categoryId)]: moreAvailable }));
      setApiPage(prev => ({ ...prev, [String(categoryId)]: page }));

      if (append) {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = filteredData.filter(p => !existingIds.has(p.id));
          const merged = [...prev, ...newOnes];
          setCategoryCache(c => ({ ...c, [categoryId]: merged }));
          return merged;
        });
      } else {
        setProducts(filteredData);
        setCategoryCache(prev => ({ ...prev, [categoryId]: filteredData }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Incrementa visible en cliente (ya están en memoria)
  const handleVerMas = () => {
    setVisibleCount(prev => prev + 12);
  };
  const handleCategoryChange = (category: typeof CATEGORIES[0]) => {
    if (category.id === activeCategory.id) return;
    setActiveCategory(category);
    setVisibleCount(12);

    // Resetear filtros al cambiar de pestaña de categoría
    setSelectedColors([]);
    setSelectedTallas([]);
    setSelectedSubcats([]);
    setPriceRange([0, 99999999]);
    setLocalPriceRange(['', '']);
    setSort(SORT_OPTIONS[0]);

    if (categoryCache[category.id]) {
      setProducts(categoryCache[category.id]);
    } else {
      fetchProducts(category.id);
    }

    // Scroll de vuelta al inicio de la sección para ver los productos del tab nuevo
    setTimeout(() => {
      const section = document.getElementById('favoritos-sticky');
      if (section) {
        const headerOffset = 80 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--global-banner-height') || '0'));
        const top = section.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }, 50);
  };

  // Extracción dinámica de Colores
  const colorTerms = useMemo(() => {
    const collected = new Map();
    if (Array.isArray(products)) {
      products.forEach(p => {
        p.attributes?.forEach((a: any) => {
          const name = (a.name || "").toLowerCase();
          const slug = (a.slug || "").toLowerCase();
          if (name.includes('color') || slug.includes('color')) {
            const terms = a.terms || [];
            terms.forEach((t: any) => {
              if (t.name) collected.set(t.slug.toLowerCase(), { name: t.name, slug: t.slug.toLowerCase() });
            });
          }
        });
      });
    }
    return Array.from(collected.values());
  }, [products]);

  // Extracción dinámica de Tallas
  const tallaTerms = useMemo(() => {
    const collected = new Map();
    if (Array.isArray(products)) {
      products.forEach(p => {
        p.attributes?.forEach((a: any) => {
          const name = (a.name || "").toLowerCase();
          const slug = (a.slug || "").toLowerCase();
          if (name.includes('talla') || name.includes('tamaño') || name.includes('size') || slug.includes('talla') || name.includes('numero') || name.includes('nmero')) {
            const terms = a.terms || [];
            terms.forEach((t: any) => {
              if (t.name) collected.set(t.slug.toLowerCase(), { name: t.name, slug: t.slug.toLowerCase() });
            });
          }
        });
      });
    }
    return Array.from(collected.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [products]);

  // Lógica condicional de categorías y subcategorías
  const categoriesAccordionData = useMemo(() => {
    const isSpecific = activeCategory.id === '955' || activeCategory.id === '63' || activeCategory.id === '190' || activeCategory.id === '249';
    
    if (isSpecific) {
      let mainCatId = '';
      if (activeCategory.id === '63') mainCatId = '63';
      else if (activeCategory.id === '249') mainCatId = '249';
      else if (activeCategory.id === '190') mainCatId = '190';
      else if (activeCategory.id === '955') mainCatId = '955';

      const matched = MENU_CATEGORIES.find(m => m.id === mainCatId || m.slug === activeCategory.slug);
      
      if (activeCategory.id === '955') {
        const ropaCat = MENU_CATEGORIES.find(m => m.id === '249');
        const sueteresSub = ropaCat?.subcategories.find(s => s.id === '955');
        if (sueteresSub) {
          return {
            isSpecific: true,
            title: 'Subcategorías',
            list: [sueteresSub]
          };
        }
      }

      if (matched && matched.subcategories.length > 0) {
        return {
          isSpecific: true,
          title: 'Subcategorías',
          list: matched.subcategories
        };
      } else {
        return {
          isSpecific: true,
          title: 'Subcategorías',
          list: []
        };
      }
    } else {
      return {
        isSpecific: false,
        title: 'Categorías y Subcategorías',
        list: MENU_CATEGORIES
      };
    }
  }, [activeCategory]);

  const toggleColor = (slug: string) => {
    setSelectedColors(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    setVisibleCount(12);
  };

  const toggleTalla = (slug: string) => {
    setSelectedTallas(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    setVisibleCount(12);
  };

  const clearFilters = () => {
    setSelectedColors([]);
    setSelectedTallas([]);
    setSelectedSubcats([]);
    setPriceRange([0, 99999999]);
    setLocalPriceRange(['', '']);
    setVisibleCount(12);
  };

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Multi-select Client Filtering Logic
  const availableSlugs = useMemo(() => {
    return new Set(
      products.flatMap(p => p.categories?.map((c: any) => c.slug?.toLowerCase()) || [])
      .filter(slug => !EXCLUDED_SLUGS.includes(slug))
    );
  }, [products]);

  // Filtrado y Ordenación en Cliente
  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // 0. Filtrar por Categorías y Subcategorías
    if (selectedSubcats.length > 0) {
      result = result.filter(p =>
        p.categories?.some((c: any) => 
          selectedSubcats.includes(c.slug?.toLowerCase())
        )
      );
    }

    // 1. Filtrar por Colores
    if (selectedColors.length > 0) {
      result = result.filter(p =>
        p.attributes?.some((a: any) => {
          const name = (a.name || "").toLowerCase();
          const slug = (a.slug || "").toLowerCase();
          if (name.includes('color') || slug.includes('color')) {
            const terms = a.terms || [];
            return terms.some((t: any) => selectedColors.includes(t.slug.toLowerCase()));
          }
          return false;
        })
      );
    }

    // 2. Filtrar por Tallas
    if (selectedTallas.length > 0) {
      result = result.filter(p =>
        p.attributes?.some((a: any) => {
          const name = (a.name || "").toLowerCase();
          const slug = (a.slug || "").toLowerCase();
          if (name.includes('talla') || name.includes('tamaño') || name.includes('size') || slug.includes('talla') || slug.includes('size') || name.includes('numero') || name.includes('nmero')) {
            const terms = a.terms || [];
            return terms.some((t: any) => selectedTallas.includes(t.slug.toLowerCase()));
          }
          return false;
        })
      );
    }

    // 3. Filtrar por Rango de Precio
    result = result.filter(p => {
      const rawPrice = p?.prices?.sale_price || p?.prices?.price || p?.prices?.regular_price || "0";
      const match = rawPrice.toString().replace(/,/g, '').match(/\d+(\.\d+)?/);
      const price = match ? Math.floor(parseFloat(match[0])) : 0;
      return price >= priceRange[0] && price <= priceRange[1];
    });

    // 4. Ordenar Productos
    if (sort.key === 'precio_asc') {
      result.sort((a, b) => {
        const pA = parseFloat(a.prices?.price || "0");
        const pB = parseFloat(b.prices?.price || "0");
        return pA - pB;
      });
    } else if (sort.key === 'precio_desc') {
      result.sort((a, b) => {
        const pA = parseFloat(a.prices?.price || "0");
        const pB = parseFloat(b.prices?.price || "0");
        return pB - pA;
      });
    } else if (sort.key === 'descuentos') {
      result.sort((a, b) => {
        const saleA = parseFloat(a.prices?.sale_price || "0");
        const regA = parseFloat(a.prices?.regular_price || "0");
        const discA = regA > 0 ? (regA - saleA) / regA : 0;

        const saleB = parseFloat(b.prices?.sale_price || "0");
        const regB = parseFloat(b.prices?.regular_price || "0");
        const discB = regB > 0 ? (regB - saleB) / regB : 0;

        return discB - discA;
      });
    } else if (sort.key === 'destacado' || !sort.key) {
      // SI ESTAMOS EN EL TAB -300K (id: '921'), ordenar por el orden del menú ppal!
      if (activeCategory.id === '921') {
        result.sort((a, b) => {
          const orderA = getProductMainCategoryOrderIndex(a);
          const orderB = getProductMainCategoryOrderIndex(b);
          if (orderA !== orderB) return orderA - orderB;
          return 0; // mantener orden relativo
        });
      }
    }

    console.log('productos filtrados:', result.length);
    return result;
  }, [products, selectedSubcats, selectedColors, selectedTallas, priceRange, sort, activeCategory.id]);

  const displayedProducts = filteredAndSortedProducts.slice(0, visibleCount);

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => fetchProducts(activeCategory.id)} className="btn">Reintentar</button>
      </div>
    );
  }

  return (
    <section id="favoritos-sticky" className="tienda">
      <div className="container-full">
        <div className="section-title">
          <span className="subtitle">SELECCIÓN EXCLUSIVA</span>
          <h2>REGALOS PARA PAPÁ</h2>
          <p className="description">
            Encuentra el regalo perfecto para él. Hemos seleccionado nuestros mejores artículos de cuero, zapatos y accesorios para celebrar su día
          </p>
        </div>

        <div className={`category-filters-wrapper ${isHeaderHidden ? 'is-hidden-top' : ''}`}>
          <div className="category-filters">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`filter-btn ${activeCategory.id === cat.id ? 'active' : ''}`}
                onClick={() => handleCategoryChange(cat)}
              >
                {cat.shortName}
              </button>
            ))}
          </div>

          {/* Barra de Filtros Avanzados */}
          <div className="filter-bar">
            <div className="filter-left">
              <span className="filter-results-count">
                {filteredAndSortedProducts.length} {filteredAndSortedProducts.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>

            <div className="filter-right">
              <div className="sort-dropdown">
                <span className="sort-label">Ordenar por: {sort.label}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <ul className="sort-list">
                  {SORT_OPTIONS.map(opt => (
                    <li key={opt.key}>
                      <button
                        onClick={() => { setSort(opt); setVisibleCount(12); }}
                        className={sort.key === opt.key ? 'active' : ''}
                      >
                        {opt.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <button className="open-filter-drawer-btn" onClick={() => setIsDrawerOpen(true)}>
                Filtro {(selectedColors.length + selectedTallas.length + selectedSubcats.length > 0) && `(${selectedColors.length + selectedTallas.length + selectedSubcats.length})`}
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Filtros Activos (Tags) */}
          {(selectedColors.length > 0 || selectedTallas.length > 0 || selectedSubcats.length > 0 || priceRange[0] > 0 || priceRange[1] < 99999999) && (
            <div className="active-filters">
              {selectedSubcats.map(s => {
                let name = s;
                for (const mc of MENU_CATEGORIES) {
                  if (mc.slug === s) { name = mc.name; break; }
                  const sub = mc.subcategories.find(sub => sub.slug === s);
                  if (sub) { name = sub.name; break; }
                }
                return (
                  <div className="filter-tag" key={s}>
                    {name}
                    <button onClick={() => toggleSubcat(s)}>×</button>
                  </div>
                );
              })}
              {selectedColors.map(c => (
                <div className="filter-tag" key={c}>
                  {translateColor(c)}
                  <button onClick={() => toggleColor(c)}>×</button>
                </div>
              ))}
              {selectedTallas.map(t => (
                <div className="filter-tag" key={t}>
                  Talla: {t}
                  <button onClick={() => toggleTalla(t)}>×</button>
                </div>
              ))}
              {(priceRange[0] > 0 || priceRange[1] < 99999999) && (
                <div className="filter-tag">
                  Precio: {priceRange[0] > 0 && `$${(priceRange[0]/1000).toFixed(0)}k`} {priceRange[0] > 0 && priceRange[1] < 99999999 && '-'} {priceRange[1] < 99999999 && `$${(priceRange[1]/1000).toFixed(0)}k`}
                  <button onClick={() => { setPriceRange([0, 99999999]); setLocalPriceRange(['', '']); }}>×</button>
                </div>
              )}
              <button className="clear-all" onClick={clearFilters}>Limpiar todo</button>
            </div>
          )}
        </div>

        {!loading && filteredAndSortedProducts.length === 0 && (
          <div className="empty-state">
            <p>No se encontraron productos con los filtros seleccionados.</p>
            <button onClick={clearFilters} className="btn btn-outline">Limpiar Filtros</button>
          </div>
        )}

        {loading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        )}

        {!loading && filteredAndSortedProducts.length > 0 && (
          <div className="grid-4x3">
            {displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {!loading && filteredAndSortedProducts.length > 0 && visibleCount < filteredAndSortedProducts.length && (
          <div className="load-more-container">
            <button
              onClick={() => setVisibleCount(prev => prev + 12)}
              className="btn btn-outline"
            >
              VER MÁS
            </button>
          </div>
        )}
      </div>

      {/* Drawer Deslizable Lateral */}
      <div className={`filter-drawer-overlay ${isDrawerOpen ? 'active' : ''}`} onClick={() => setIsDrawerOpen(false)}></div>
      <div className={`filter-drawer ${isDrawerOpen ? 'active' : ''}`}>
        <div className="drawer-header">
          <h3>Mostrar filtros</h3>
          <button className="close-drawer" onClick={() => setIsDrawerOpen(false)} aria-label="Cerrar filtros">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="1.5" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          {/* Acordeón de Categorías y Subcategorías */}
          {categoriesAccordionData.list.length > 0 && (
            <div className={`filter-group-accordion ${openSections.categories ? 'open' : ''}`}>
              <button className="accordion-header" onClick={() => toggleSection('categories')}>
                {categoriesAccordionData.title}
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div className="accordion-body">
                <ul className="checklist">
                  {categoriesAccordionData.isSpecific ? (
                    (categoriesAccordionData.list as any[])
                      .filter(sub => availableSlugs.has(sub.slug))
                      .map(sub => (
                      <li key={sub.slug}>
                        <label className="checkbox-container">
                          <input
                            type="checkbox"
                            checked={selectedSubcats.includes(sub.slug)}
                            onChange={() => toggleSubcat(sub.slug)}
                          />
                          <span className="checkmark"></span>
                          <span className="label-text">{sub.name}</span>
                        </label>
                      </li>
                    ))
                  ) : (
                    (categoriesAccordionData.list as any[]).map(mainCat => (
                      <li key={mainCat.slug} className="main-cat-li" style={{ marginBottom: '0.8rem' }}>
                        <label className="checkbox-container" style={{ fontWeight: '700' }}>
                          <input
                            type="checkbox"
                            checked={selectedSubcats.includes(mainCat.slug)}
                            onChange={() => toggleSubcat(mainCat.slug)}
                          />
                          <span className="checkmark"></span>
                          <span className="label-text" style={{ fontSize: '0.9rem', color: '#121212' }}>{mainCat.name}</span>
                        </label>
                        {mainCat.subcategories.length > 0 && (
                          <ul className="subcategories-list" style={{ listStyle: 'none', paddingLeft: '1.8rem', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {mainCat.subcategories
                              .filter((sub: any) => availableSlugs.has(sub.slug))
                              .map((sub: any) => (
                              <li key={sub.slug}>
                                <label className="checkbox-container small">
                                  <input
                                    type="checkbox"
                                    checked={selectedSubcats.includes(sub.slug)}
                                    onChange={() => toggleSubcat(sub.slug)}
                                  />
                                  <span className="checkmark"></span>
                                  <span className="label-text" style={{ color: '#555' }}>{sub.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Acordeón de Colores */}
          {colorTerms.length > 0 && (
            <div className={`filter-group-accordion ${openSections.color ? 'open' : ''}`}>
              <button className="accordion-header" onClick={() => toggleSection('color')}>
                Colores
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div className="accordion-body">
                <ul className="checklist grid-2">
                  {colorTerms.map(term => (
                    <li key={term.slug}>
                      <label className="checkbox-container small">
                        <input
                          type="checkbox"
                          checked={selectedColors.includes(term.slug)}
                          onChange={() => toggleColor(term.slug)}
                        />
                        <span className="checkmark"></span>
                        <div className="color-info">
                          <span className="color-circle" style={{ backgroundColor: getColorHex(term.slug), border: '1px solid #eee' }}></span>
                          <span className="label-text">{translateColor(term.name)}</span>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Acordeón de Tallas */}
          {tallaTerms.length > 0 && (
            <div className={`filter-group-accordion ${openSections.talla ? 'open' : ''}`}>
              <button className="accordion-header" onClick={() => toggleSection('talla')}>
                Tallas
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div className="accordion-body">
                <div className="talla-options">
                  {tallaTerms.map(term => (
                    <button
                      key={term.slug}
                      onClick={() => toggleTalla(term.slug)}
                      className={`talla-box ${selectedTallas.includes(term.slug) ? 'active' : ''}`}
                    >
                      {term.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Acordeón de Precio */}
          <div className={`filter-group-accordion ${openSections.precio ? 'open' : ''}`}>
            <button className="accordion-header" onClick={() => toggleSection('precio')}>
              Precio
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div className="accordion-body">
              <div className="price-inputs" style={{ display: 'flex', gap: '10px', padding: '10px 0' }}>
                <input
                  type="number"
                  min="0"
                  placeholder="Mínimo"
                  value={localPriceRange[0]}
                  onChange={(e) => setLocalPriceRange([e.target.value, localPriceRange[1]])}
                  style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '14px', color: '#000' }}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Máximo"
                  value={localPriceRange[1]}
                  onChange={(e) => setLocalPriceRange([localPriceRange[0], e.target.value])}
                  style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '14px', color: '#000' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-footer-sticky">
          <button className="btn-show-products" onClick={() => setIsDrawerOpen(false)}>
            Mostrar productos
          </button>
          <button className="btn-clear-minimal" onClick={clearFilters}>Limpiar Filtros</button>
        </div>
      </div>

      <style>{`
        .tienda { background-color: #fff; padding: 1rem 0 4rem 0; width: 100%; }
        .container-full { width: 100%; padding: 0; }
        .section-title { text-align: center; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 1rem; }
        .subtitle { font-size: 0.8rem; color: #999; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 0.5rem; font-family: var(--font-paragraphs); }
        .section-title h2 { font-size: 1.5rem; margin-bottom: 1.5rem; color: var(--color-green); line-height: 1; letter-spacing: 4px; font-weight: 700; }
        .description { font-size: 0.85rem; color: #333; line-height: 1.6; font-family: var(--font-paragraphs); max-width: 600px; margin: 0 auto; }

        .category-filters-wrapper {
          position: sticky;
          top: calc(80px + var(--global-banner-height, 0px)); 
          z-index: 90;
          background-color: #ffffff;
          padding: 1.5rem 0;
          margin-bottom: 2rem;
          transition: top 0.3s ease-in-out;
        }

        .category-filters-wrapper.is-hidden-top {
          top: 0;
        }

        .category-filters {
          display: flex;
          justify-content: center;
          gap: 1rem;
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 2rem;
          flex-wrap: wrap;
        }

        .filter-btn {
          flex: 1;
          max-width: 250px;
          padding: 1rem 1.5rem;
          border: 1px solid #e5e5e5;
          background-color: #f9f9f9;
          color: var(--color-green, #155338);
          font-family: var(--font-titles, sans-serif);
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .filter-btn.active {
          background-color: var(--color-green, #155338);
          color: #fff;
          border-color: var(--color-green, #155338);
          box-shadow: 0 4px 10px rgba(21, 83, 56, 0.15);
        }

        .filter-btn:hover:not(.active) {
          background-color: var(--color-beige, #B1915F);
          color: #fff;
          border-color: var(--color-beige, #B1915F);
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(177, 145, 95, 0.2);
        }

        /* Estilos de Barra de Filtros */
        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1600px;
          margin: 0 auto;
          padding: 1rem 2rem 0;
          position: relative;
          border-top: 1px solid #f0f0f0;
          margin-top: 1rem;
        }
        .filter-left {
          display: flex;
          align-items: center;
        }
        .filter-results-count {
          font-family: var(--font-paragraphs);
          font-size: 0.8rem;
          color: #888;
          letter-spacing: 0.5px;
        }
        .filter-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .sort-dropdown {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border: 1px solid #e5e5e5;
          cursor: pointer;
          position: relative;
          width: 220px;
          background-color: #fff;
        }
        .sort-dropdown:hover .sort-list {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .sort-label {
          font-family: var(--font-paragraphs);
          font-size: 0.75rem;
          color: #333;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .sort-list {
          position: absolute;
          top: calc(100% + 1px);
          right: -1px;
          background: #fff;
          list-style: none;
          padding: 0.5rem 0;
          margin: 0;
          width: calc(100% + 2px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
          border: 1px solid #e8e8e8;
          border-top: none;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: all 0.2s;
          z-index: 110;
        }
        .sort-list li button {
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          display: block;
          padding: 0.6rem 1.2rem;
          color: #666;
          font-family: var(--font-paragraphs);
          font-size: 0.75rem;
          cursor: pointer;
        }
        .sort-list li button:hover, .sort-list li button.active {
          color: var(--color-green, #155338);
          background-color: #f9f9f9;
          font-weight: 600;
        }
        .open-filter-drawer-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1.2rem;
          background: transparent;
          border: 1px solid #e5e5e5;
          font-family: var(--font-paragraphs);
          font-size: 0.75rem;
          color: #333;
          cursor: pointer;
          transition: all 0.2s;
        }
        .open-filter-drawer-btn:hover {
          border-color: #121212;
          background: #f9f9f9;
        }
        .active-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          align-items: center;
          max-width: 1600px;
          margin: 0 auto;
          padding: 1rem 2rem 0;
        }
        .filter-tag {
          background: #f4f4f4;
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
          font-size: 0.7rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-family: var(--font-paragraphs);
          color: #333;
        }
        .filter-tag button {
          background: none;
          border: none;
          cursor: pointer;
          color: #999;
          font-size: 1rem;
          padding: 0;
          line-height: 1;
        }
        .clear-all {
          font-family: var(--font-paragraphs);
          font-size: 0.7rem;
          color: #888;
          text-decoration: underline;
          cursor: pointer;
          background: none;
          border: none;
        }
        
        /* Estilos del Drawer */
        .filter-drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.4);
          z-index: 9998;
          opacity: 0;
          visibility: hidden;
          transition: all 0.4s ease;
          pointer-events: none;
        }
        .filter-drawer-overlay.active {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .filter-drawer {
          position: fixed;
          top: 0;
          right: -400px;
          width: 400px;
          height: 100%;
          background: #fff;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          transition: right 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
        }
        .filter-drawer.active {
          right: 0;
        }
        .drawer-header {
          padding: 1.5rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eee;
        }
        .drawer-header h3 {
          font-family: var(--font-titles, sans-serif);
          font-size: 1.1rem;
          color: var(--color-green, #155338);
          margin: 0;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .close-drawer {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          color: #888;
          display: flex;
          align-items: center;
        }
        .drawer-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem 2rem;
        }
        .filter-group-accordion {
          border-bottom: 1px solid #eee;
        }
        .accordion-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.2rem 0;
          background: none;
          border: none;
          cursor: pointer;
          font-family: var(--font-titles, sans-serif);
          font-size: 0.85rem;
          color: #121212;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 700;
        }
        .arrow-icon {
          transition: transform 0.3s ease;
        }
        .filter-group-accordion.open .arrow-icon {
          transform: rotate(180deg);
        }
        .accordion-body {
          max-height: 0;
          transition: max-height 0.4s cubic-bezier(0, 1, 0, 1);
          overflow: hidden;
        }
        .filter-group-accordion.open .accordion-body {
          max-height: 1000px;
          transition: max-height 0.4s ease-in;
          padding-bottom: 1.5rem;
        }
        .checklist {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .checklist.grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem 0.5rem;
        }
        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          cursor: pointer;
          font-size: 0.85rem;
          user-select: none;
          position: relative;
        }
        .checkbox-container.small {
          gap: 0.5rem;
          font-size: 0.8rem;
        }
        .checkbox-container input {
          display: none;
        }
        .checkmark {
          height: 16px;
          width: 16px;
          border: 1px solid #ddd;
          background-color: #fff;
          display: block;
          position: relative;
          flex-shrink: 0;
        }
        .checkbox-container input:checked ~ .checkmark {
          background-color: var(--color-green, #155338);
          border-color: var(--color-green, #155338);
        }
        .checkmark:after {
          content: "";
          position: absolute;
          display: none;
          left: 5px;
          top: 1px;
          width: 4px;
          height: 8px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .checkbox-container input:checked ~ .checkmark:after {
          display: block;
        }
        .color-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .color-circle {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .talla-options {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .talla-box {
          min-width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #ddd;
          background: #fff;
          font-family: var(--font-paragraphs);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .talla-box:hover {
          border-color: #000;
        }
        .talla-box.active {
          background: var(--color-green, #155338);
          color: #fff;
          border-color: var(--color-green, #155338);
        }
        .drawer-footer-sticky {
          padding: 1.5rem 2rem;
          border-top: 1px solid #eee;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .btn-show-products {
          width: 100%;
          padding: 1rem;
          background: var(--color-green, #155338);
          color: #fff;
          border: none;
          font-family: var(--font-titles, sans-serif);
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 0.5rem;
          font-weight: 700;
          text-align: center;
        }
        .btn-show-products:hover {
          background: var(--color-beige, #B1915F);
        }
        .btn-clear-minimal {
          background: none;
          border: none;
          text-decoration: underline;
          color: #888;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.5rem;
        }

        @media (max-width: 768px) {
          .section-title h2 { font-size: 1.25rem; }
          .description { font-size: 0.75rem; }
          .category-filters { 
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.6rem;
            padding: 0 1rem;
          }
          .filter-btn { 
            width: 100%;
            max-width: 100%;
            padding: 0.8rem 0.5rem;
            font-size: 0.75rem;
            letter-spacing: 1px;
          }
          .category-filters-wrapper { top: calc(64px + var(--global-banner-height, 0px)); } 

          .filter-bar {
            padding: 1rem 1rem 0;
          }
          .active-filters {
            padding: 1rem 1rem 0;
          }
          .filter-right {
            width: 100%;
            justify-content: space-between;
          }
          .sort-dropdown {
            width: 55%;
          }
          .open-filter-drawer-btn {
            width: 40%;
            justify-content: center;
          }
        }

        @media (max-width: 480px) {
          .category-filters {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.5rem;
          }
          .filter-btn {
            font-size: 0.7rem;
            padding: 0.75rem 0.4rem;
          }
          .filter-drawer {
            width: 100%;
            right: -100%;
          }
        }

        .grid-4x3 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0rem;
          width: 100%;
        }

        @media (max-width: 1200px) { .grid-4x3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 768px) { .grid-4x3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 480px) { .grid-4x3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

        .load-more-container { margin-top: 4rem; display: flex; justify-content: center; }
        .error-container { text-align: center; padding: 4rem 0; }
        .loading-spinner { display: flex; justify-content: center; margin: 4rem 0; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(21, 83, 56, 0.1); border-left-color: var(--color-green); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .btn-outline {
          border: 1px solid var(--color-green);
          background: transparent;
          color: var(--color-green);
          padding: 0.8rem 2.5rem;
          text-decoration: none;
          text-transform: uppercase;
          font-size: 0.8rem;
          letter-spacing: 2px;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .btn-outline:hover {
          background: var(--color-green);
          color: #fff;
        }
        
        .empty-state {
          text-align: center;
          padding: 4rem 1rem;
        }
        .empty-state p {
          font-family: var(--font-paragraphs);
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 1.5rem;
        }
      `}</style>
    </section>
  );
}

const COLOR_TRANSLATIONS: Record<string, string> = {
  'black': 'Negro', 'brown': 'Café', 'beige': 'Beige', 'blue': 'Azul', 'white': 'Blanco', 'red': 'Rojo', 'green': 'Verde', 'yellow': 'Amarillo', 'gray': 'Gris', 'grey': 'Gris', 'navy': 'Azul Noche', 'tan': 'Canela', 'honey': 'Miel', 'tobacco': 'Tabaco'
};

function translateColor(text: string | undefined): string {
  if (!text) return "";
  return COLOR_TRANSLATIONS[text.toLowerCase()] || text;
}

function getColorHex(slug: string | undefined): string {
  if (!slug) return "#ddd";
  const s = slug.toLowerCase();
  const colors: Record<string, string> = {
      'negro': '#121212', 'black': '#121212',
      'cafe': '#6F4E37', 'café': '#6F4E37', 'marron': '#6F4E37', 'marrón': '#6F4E37', 'brown': '#6F4E37', 'chocolate': '#3E2723',
      'miel': '#D4A373', 'honey': '#D4A373',
      'azul': '#1B3F8B', 'blue': '#1B3F8B', 'marino': '#000080',
      'verde': '#155338', 'green': '#155338',
      'vino': '#722F37', 'vinotinto': '#722F37', 'burgundy': '#722F37',
      'tabaco': '#8B5A2B', 'tobacco': '#8B5A2B',
      'cognac': '#9A463D',
      'rojo': '#C41E3A', 'red': '#C41E3A',
      'blanco': '#FFFFFF', 'white': '#FFFFFF',
      'gris': '#888888', 'gray': '#888888',
      'beige': '#F5F5DC', 'arena': '#E2CBA4',
      'tan': '#D2B48C', 'camel': '#C19A6B',
      'rosa': '#E91E63', 'pink': '#E91E63',
      'mostaza': '#E1AD01', 'mustard': '#E1AD01',
      'morado': '#9C27B0', 'purple': '#9C27B0', 'violeta': '#7B1FA2',
      'naranja': '#FF6600', 'orange': '#FF6600', 'naranaja': '#FF6600'
  };

  if (colors[s]) return colors[s];
  const noDash = s.replace(/-/g, '');
  if (colors[noDash]) return colors[noDash];

  if (s.includes('negro')) return colors['negro'];
  if (s.includes('cafe')) return colors['cafe'];
  if (s.includes('café')) return colors['café'];
  if (s.includes('marron') || s.includes('marrón')) return colors['marron'];
  if (s.includes('azul')) return colors['azul'];
  if (s.includes('miel')) return colors['miel'];
  if (s.includes('tabaco')) return colors['tabaco'];
  if (s.includes('verde')) return colors['verde'];
  if (s.includes('rojo')) return colors['rojo'];
  if (s.includes('blanco')) return colors['blanco'];
  if (s.includes('gris')) return colors['gris'];
  if (s.includes('vino')) return colors['vino'];
  if (s.includes('chocolate')) return colors['chocolate'];
  if (s.includes('rosa')) return colors['rosa'];
  if (s.includes('mostaza')) return colors['mostaza'];
  if (s.includes('morado')) return colors['morado'];
  if (s.includes('purple')) return colors['morado'];
  if (s.includes('naranja')) return colors['naranja'];
  if (s.includes('orange')) return colors['naranja'];

  return '#ddd';
}

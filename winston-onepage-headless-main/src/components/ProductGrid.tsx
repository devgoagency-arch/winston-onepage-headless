import { useState, useEffect } from 'react';
import ProductCard from './ProductCard';

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
    src: string;
    alt: string;
  }[];
  attributes: {
    id: number;
    name: string;
    terms: { id: number; name: string; slug: string }[];
  }[];
  variations: {
    id: number;
    attributes: { name: string; value: string }[];
  }[];
  variation_images_map?: Record<string, any[]>;
}

export default function ProductGrid() {
  const [products, setProducts] = useState<Product[]>([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      // Eliminamos el timestamp para permitir que el caché de Vercel funcione
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Error al cargar zapatos');

      const data: Product[] = await response.json();

      // Filtro de seguridad para evitar duplicados que rompan el grid (Duplicate Keys)
      setProducts(prev => {
        const result: Product[] = [];
        const seenIds: { [key: number]: boolean } = {};

        // Unimos los actuales y los nuevos, filtrando duplicados por ID
        [...prev, ...data].forEach(p => {
          if (!seenIds[p.id]) {
            seenIds[p.id] = true;
            result.push(p);
          }
        });
        return result;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const loadMore = () => {
    setVisibleCount(prev => prev + 12);
  };

  const displayedProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => fetchProducts()} className="btn">Reintentar</button>
      </div>
    );
  }

  return (
    <section id="tienda" className="tienda">
      <div className="container-full">
        <div className="section-title">
          <span className="subtitle">ACCESORIOS Y ZAPATOS DE CUERO PARA HOMBRE</span>
          <h2>LOS FAVORITOS</h2>
          <p className="description">
            En un mundo en el que todos tratamos de encajar, la única forma de diferenciarnos es honrando nuestras diferencias reflejadas en nuestra personalidad.
          </p>
        </div>

        <div className="grid-4x3">
          {displayedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {!loading && products.length === 0 && (
          <div className="empty-state">
            <p>No se encontraron zapatos en esta colección.</p>
            <button onClick={() => fetchProducts()} className="btn btn-outline">Actualizar</button>
          </div>
        )}

        {loading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        )}

        {hasMore && !loading && (
          <div className="load-more-container">
            <button onClick={loadMore} className="btn btn-outline">
              Ver más zapatos
            </button>
          </div>
        )}
      </div>

      <style>{`
        .tienda { background-color: #fff; padding: 4rem 0; width: 100%; }
        .container-full { width: 100%; padding: 0; }
        .section-title { text-align: center; margin-bottom: 3rem; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 1rem; }
        .subtitle { font-size: 0.8rem; color: #999; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 0.5rem; font-family: var(--font-paragraphs); }
        .section-title h2 { font-size: 1.25rem; margin-bottom: 1.5rem; color: var(--color-green); line-height: 1; }
        .description { font-size: 0.8rem; color: #666; line-height: 1.6; font-family: var(--font-paragraphs); }

        @media (max-width: 768px) {
          .section-title h2 { font-size: 1.15rem; }
          .description { font-size: 0.75rem; }
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
        .loading-spinner { display: flex; justify-content: center; margin-top: 3rem; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(21, 83, 56, 0.1); border-left-color: var(--color-green); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}

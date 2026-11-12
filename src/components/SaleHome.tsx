import { useEffect, useState } from 'react';
import ProductCard from './ProductCard';
import { getProductPrice, getProductRegularPrice } from '../lib/productFilters';

/**
 * Sección SALE del home: las 12 ofertas con mayor descuento (con stock).
 * Lee /data/catalog/sale-home.json, que genera src/pages/sale.astro en cada build.
 * Si el archivo no existe o viene vacío, la sección se oculta sola.
 */
export default function SaleHome() {
  const [products, setProducts] = useState<any[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch('/data/catalog/sale-home.json');
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (isMounted) setProducts(Array.isArray(data) ? data.slice(0, 12) : []);
      } catch {
        if (isMounted) setProducts([]);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  // Sin ofertas (o archivo no disponible): no se muestra nada
  if (products && products.length === 0) return null;

  // Mayor descuento entre los productos mostrados, para el texto de la sección
  const maxDiscount = (products || []).reduce((max, p) => {
    const regular = getProductRegularPrice(p);
    const price = getProductPrice(p);
    return regular > price && price > 0 ? Math.max(max, Math.round((1 - price / regular) * 100)) : max;
  }, 0);

  return (
    <section id="sale-home" className="sale-home" aria-label="Ofertas Sale">
      <div className="sale-home-title">
        <span className="sale-home-subtitle">PRECIOS ESPECIALES</span>
        <h2>Sale</h2>
        <p className="sale-home-description">
          Aprovecha precios especiales en nuestras últimas piezas
          {maxDiscount > 0 ? `, con hasta ${maxDiscount} % de descuento.` : '.'}
        </p>
      </div>

      {products === null ? (
        <div className="sale-home-loading" aria-hidden="true"></div>
      ) : (
        <>
          <div className="sale-home-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="sale-home-cta">
            <a href="/sale" className="sale-home-btn">VER TODAS LAS OFERTAS</a>
          </div>
        </>
      )}

      <style>{`
        .sale-home { background-color: #fff; padding: 1rem 0 4rem 0; width: 100%; }
        .sale-home-title { text-align: center; margin: 0 auto 2rem; max-width: 800px; padding: 0 1rem; }
        .sale-home-subtitle { display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #999; letter-spacing: 2px; text-transform: uppercase; font-family: var(--font-paragraphs); }
        .sale-home-title h2 { font-size: 1.5rem; margin-bottom: 1.5rem; color: var(--color-green); line-height: 1; letter-spacing: 4px; font-weight: 700; text-transform: uppercase; }
        .sale-home-description { font-size: 1rem; color: #333; line-height: 1.6; font-family: var(--font-paragraphs); max-width: 600px; margin: 0 auto; }
        .sale-home-loading { min-height: 480px; }
        .sale-home-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; width: 100%; }
        @media (max-width: 1200px) { .sale-home-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 768px) {
          .sale-home-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .sale-home-title h2 { font-size: 1.25rem; }
        }
        .sale-home-cta { margin-top: 4rem; display: flex; justify-content: center; }
        .sale-home-btn {
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
        .sale-home-btn:hover { background: var(--color-green); color: #fff; }
      `}</style>
    </section>
  );
}

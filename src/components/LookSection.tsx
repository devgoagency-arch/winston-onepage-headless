import { useState, useEffect, useCallback, useMemo } from 'react';
import ProductCard from './ProductCard';
import { addToCart } from '../store/cart';

interface LookData {
    look_titulo: string;
    look_descripcion: string;
    look_imagen: string;
    products: any[];
}

export default function LookSection() {
    const [data, setData] = useState<LookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [lookVariations, setLookVariations] = useState<Record<number, { color: string | null, size: string | null, variationId?: number | null }>>({});

    useEffect(() => {
        const fetchLook = async () => {
            try {
                const res = await fetch('/api/look-of-the-week');
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                    if (json?.products) {
                        setSelectedIds(json.products.map((p: any) => p.id));
                    }
                }
            } catch (e) {
                console.error("Error fetching look:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchLook();
    }, []);

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
    }, []);

    const handleVariationChange = useCallback((productId: number, color: string | null, size: string | null, variationId?: number | null) => {
        setLookVariations(prev => {
            const current = prev[productId];
            if (current?.color === color && current?.size === size && current?.variationId === variationId) return prev;
            return { ...prev, [productId]: { color, size, variationId } };
        });
    }, []);

    const handleAddAllToCart = () => {
        if (!data) return;
        data.products.forEach(p => {
            if (selectedIds.includes(p.id)) {
                const varia = lookVariations[p.id];
                const finalId = varia?.variationId || p.id;
                addToCart({ ...p, id: finalId }, 1, varia?.color || null, varia?.size || null, p.images[0]?.src);
            }
        });
    };

    // Cálculos estables
    const { total, currencySymbol, isWaiting } = useMemo(() => {
        if (!data || !data.products) return { total: 0, currencySymbol: '$', isWaiting: false };

        let currentTotal = 0;
        let waiting = false;

        data.products.forEach(p => {
            if (selectedIds.includes(p.id)) {
                // Cálculo de precio
                const priceVal = parseInt(String(p.prices?.price || '0').replace(/[^\d]/g, ''));
                currentTotal += (priceVal / (10 ** (p.prices?.currency_minor_unit || 0)));

                // Verificación de variantes
                if (p.type === 'variable' && !lookVariations[p.id]?.variationId) {
                    waiting = true;
                }
            }
        });

        const sym = data.products[0]?.prices?.currency_prefix || data.products[0]?.prices?.currency_symbol || '$';

        return { total: currentTotal, currencySymbol: sym, isWaiting: waiting };
    }, [data, selectedIds, lookVariations]);

    if (loading || !data) return (
        <div style={{ padding: '100px', textAlign: 'center', backgroundColor: '#fcfcfc' }}>
            <p style={{ fontFamily: 'var(--font-products)', letterSpacing: '2px', color: '#999' }}>CARGANDO LOOK DE LA SEMANA...</p>
        </div>
    );

    return (
        <section className="look-of-the-week">
            <div className="look-wrapper">
                <div className="look-grid">
                    <div className="look-image-col">
                        <img src={data.look_imagen + '.webp'} alt={data.look_titulo} className="lifestyle-image" />
                    </div>

                    <div className="look-content-col">
                        <div className="look-header">
                            <h2 className="look-title">{data.look_titulo || 'LOOK DE LA SEMANA'}</h2>
                            <div className="look-desc" dangerouslySetInnerHTML={{ __html: data.look_descripcion }} />
                        </div>

                        <div className="look-products-selection">
                            <div className="look-products-row">
                                {data.products.map((product, index) => (
                                    <div key={product.id} className="look-product-card-wrapper">
                                        {index > 0 && <span className="look-plus">+</span>}
                                        <div className="look-card-inner">
                                            <ProductCard
                                                product={product}
                                                isSelected={selectedIds.includes(product.id)}
                                                onSelectionToggle={toggleSelection}
                                                onVariationChange={handleVariationChange}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {selectedIds.length > 0 && (
                                <div className="look-summary-box">
                                    <p className="summary-label">TOTAL SELECCIONADO:</p>
                                    <p className="summary-price">
                                        {currencySymbol} {new Intl.NumberFormat('es-CO').format(total)}
                                    </p>
                                    <button
                                        className={`look-add-button ${isWaiting ? 'disabled' : ''}`}
                                        onClick={handleAddAllToCart}
                                        disabled={isWaiting}
                                    >
                                        {isWaiting ? 'ELIGE TALLA/COLOR...' : 'AÑADIR AL CARRITO'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .look-of-the-week { background-color: #fcfcfc; padding: 2rem 1rem; }
                .look-wrapper { max-width: 1400px; margin: 0 auto; background: #fff; box-shadow: 0 10px 50px rgba(0,0,0,0.06); }
                .look-grid { display: grid; grid-template-columns: 1fr 1fr; min-height: 600px; }
                .look-image-col { background: #eee; }
                .lifestyle-image { width: 100%; height: 100%; object-fit: cover; display: block; }
                .look-content-col { padding: 4rem 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .look-header { max-width: 500px; text-align: center; margin-bottom: 3rem; }
                .look-title { color: #155338; font-family: var(--font-products); letter-spacing: 3px; font-size: 1.25rem; text-transform: uppercase; margin-bottom: 1.5rem; }
                .look-desc { font-size: 0.9rem; color: #666; line-height: 1.8; }
                .look-products-selection { width: 100%; display: flex; flex-direction: column; align-items: center; }
                .look-products-row { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 2rem; width: 100%; flex-wrap: wrap; }
                .look-product-card-wrapper { display: flex; align-items: center; gap: 0.5rem; }
                .look-plus { font-size: 2rem; color: #155338; font-weight: 300; margin-bottom: 40px; }
                .look-card-inner { width: 220px; }
                .look-summary-box { border: 1px solid #f0f0f0; padding: 2rem 3.5rem; text-align: center; background: #fff; }
                .summary-label { font-size: 0.7rem; letter-spacing: 2px; color: #999; margin-bottom: 0.5rem; }
                .summary-price { font-size: 1.8rem; color: #A98B68; font-weight: 600; font-family: var(--font-products); margin-bottom: 1.5rem; }
                .look-add-button { background: #155338; color: #fff; border: none; padding: 1rem 2rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; transition: all 0.3s; width: 100%; }
                .look-add-button:hover:not(.disabled) { background: #0d3222; transform: translateY(-3px); }
                .look-add-button.disabled { background: #ccc; cursor: not-allowed; }

                @media (max-width: 1024px) {
                    .look-grid { display: flex; flex-direction: column; }
                    .look-image-col { height: 400px; }
                    .look-content-col { padding: 3rem 1.5rem; }
                    .look-products-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
                    .look-plus { display: none; }
                    .look-card-inner { width: 100%; }
                    .look-summary-box { width: 100%; padding: 2rem 1rem; }
                    .look-wrapper { box-shadow: none; }
                }
            `}</style>
        </section>
    );
}

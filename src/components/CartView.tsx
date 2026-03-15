
import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { cartItems, removeFromCart, updateQuantity, updateCartItemVariation, type CartItem } from '../store/cart';
import { redirectToCheckout } from '../utils/checkout';

export default function CartView() {
    const $cartItems = useStore(cartItems);

    const items = useMemo(() => {
        return Object.entries($cartItems)
            .filter(([_, value]) => !!value)
            .map(([key, value]) => {
                try {
                    return {
                        key,
                        ...(JSON.parse(value) as CartItem)
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter((item): item is (CartItem & { key: string }) => item !== null);
    }, [$cartItems]);

    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [items]);

    const handleCheckout = () => {
        window.location.href = '/checkout';
    };

    if (items.length === 0) {
        return (
            <div className="cart-page-empty">
                <div className="container">
                    <h1>TU CARRITO ESTÁ VACÍO</h1>
                    <p>Parece que aún no has añadido nada a tu bolsa.</p>
                    <a href="/tienda" className="btn-green">VOLVER A LA TIENDA</a>
                </div>
            </div>
        );
    }

    return (
        <div className="cart-page-container">
            <div className="container">
                <h1 className="cart-page-title">CARRITO DE COMPRAS</h1>

                <div className="cart-grid">
                    <div className="cart-main">
                        <div className="cart-table-header">
                            <span className="col-product">PRODUCTO</span>
                            <span className="col-price">PRECIO</span>
                            <span className="col-qty">CANTIDAD</span>
                            <span className="col-total">TOTAL</span>
                        </div>

                        <div className="cart-items-list">
                            {items.map((item) => {
                                const colorAttr = item.attributes?.find(a => {
                                    const name = String(a.name || '').toLowerCase();
                                    const id = String(a.id || '').toLowerCase();
                                    return name.includes('color') || id.includes('color');
                                });
                                const sizeAttr = item.attributes?.find(a => {
                                    const name = String(a.name || '').toLowerCase();
                                    const id = String(a.id || '').toLowerCase();
                                    return name.includes('talla') || id.includes('talla') || name.includes('size');
                                });

                                return (
                                    <div key={item.key} className="cart-item-row">
                                        <div className="col-product item-info">
                                            <div className="item-img">
                                                <img src={item.image} alt={item.name} />
                                            </div>
                                            <div className="item-text">
                                                <div className="item-title-row">
                                                    <h3>{item.name}</h3>
                                                    <button className="item-remove-x mobile-only" onClick={() => removeFromCart(item.key)}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                            <path d="M18 6L6 18M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="item-meta">
                                                    {colorAttr && (
                                                        <div className="meta-field">
                                                            <label>Color:</label>
                                                            <select
                                                                value={item.color || ''}
                                                                onChange={(e) => updateCartItemVariation(item.key, e.target.value, item.size)}
                                                            >
                                                                <option value="" disabled>Elegir</option>
                                                                {(colorAttr.terms || colorAttr.options || []).map((term: any) => {
                                                                    const val = typeof term === 'string' ? term : (term.slug || term.name);
                                                                    const lab = typeof term === 'string' ? term : term.name;
                                                                    return <option key={val} value={val}>{lab}</option>;
                                                                })}
                                                            </select>
                                                        </div>
                                                    )}
                                                    {sizeAttr && (
                                                        <div className="meta-field">
                                                            <label>Talla:</label>
                                                            <select
                                                                value={item.size || ''}
                                                                onChange={(e) => updateCartItemVariation(item.key, item.color, e.target.value)}
                                                            >
                                                                <option value="" disabled>Elegir</option>
                                                                {(sizeAttr.terms || sizeAttr.options || []).map((term: any) => {
                                                                    const val = typeof term === 'string' ? term : (term.slug || term.name);
                                                                    const lab = typeof term === 'string' ? term : term.name;
                                                                    return <option key={val} value={val}>{lab}</option>;
                                                                })}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                                <button className="btn-remove desktop-only" onClick={() => removeFromCart(item.key)}>ELIMINAR</button>

                                                {/* Mobile Qty and Price (matches SideCart) */}
                                                <div className="item-price-qty-row mobile-only">
                                                    <div className="qty-control">
                                                        <button onClick={() => updateQuantity(item.key, item.quantity - 1)}>−</button>
                                                        <span>{item.quantity}</span>
                                                        <button onClick={() => updateQuantity(item.key, item.quantity + 1)}>+</button>
                                                    </div>
                                                    <div className="item-price-mobile">
                                                        × <span>${new Intl.NumberFormat('es-CO').format(item.price)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-price desktop-only">
                                            ${new Intl.NumberFormat('es-CO').format(item.price)}
                                        </div>
                                        <div className="col-qty desktop-only">
                                            <div className="qty-control">
                                                <button onClick={() => updateQuantity(item.key, item.quantity - 1)}>−</button>
                                                <span>{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.key, item.quantity + 1)}>+</button>
                                            </div>
                                        </div>
                                        <div className="col-total desktop-only">
                                            ${new Intl.NumberFormat('es-CO').format(item.price * item.quantity)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="cart-sidebar">
                        <div className="summary-card">
                            <h2>RESUMEN DE COMPRA</h2>
                            <div className="summary-row">
                                <span>Subtotal</span>
                                <span>${new Intl.NumberFormat('es-CO').format(subtotal)}</span>
                            </div>
                            <div className="summary-row total">
                                <span>Total</span>
                                <div className="total-stack">
                                    <span className="total-amount">${new Intl.NumberFormat('es-CO').format(subtotal)}</span>
                                    <span className="tax-info">(IVA incluido)</span>
                                </div>
                            </div>
                            <button className="btn-checkout" onClick={handleCheckout}>
                                FINALIZAR COMPRA
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .cart-page-container {
                    padding: 12rem 0;
                    background: #fff;
                    min-height: 70vh;
                }
                .cart-page-title {
                    font-family: var(--font-titles);
                    font-size: 1.25rem;
                    text-align: left;
                    margin-bottom: 3rem;
                    color: var(--color-green);
                    letter-spacing: 2px;
                }
                .cart-grid {
                    display: grid;
                    grid-template-columns: 1fr 380px;
                    gap: 3rem;
                }
                .cart-table-header {
                    display: grid;
                    grid-template-columns: 1fr 120px 140px 120px;
                    padding: 1.5rem 0;
                    border-bottom: 1px solid #eee;
                    font-family: var(--font-paragraphs);
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #999;
                    letter-spacing: 1px;
                }
                .cart-item-row {
                    display: grid;
                    grid-template-columns: 1fr 120px 140px 120px;
                    align-items: center;
                    padding: 2.5rem 0;
                    border-bottom: 1px solid #f9f9f9;
                }
                .item-info {
                    display: flex;
                    gap: 2rem;
                }
                .item-img {
                    width: 100px;
                    height: 100px;
                    background: #f6f6f6;
                    border-radius: 4px;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .item-img img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .item-text {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                }
                .item-title-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    width: 100%;
                }
                .mobile-only { display: none; }
                .desktop-only { display: block; }
                .item-remove-x {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #ccc;
                    padding: 0;
                }
                .item-remove-x:hover { color: #d32f2f; }
                
                .item-text h3 {
                    font-family: var(--font-products);
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    margin: 0rem;
                    color: var(--color-green);
                }
                .item-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 0rem;
                    margin-bottom: 0rem;
                }
                .meta-field {
                    font-size: 0.8rem;
                    color: #666;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .meta-field select {
                    border: none;
                    background: transparent;
                    color: var(--color-beige);
                    font-weight: 500;
                    cursor: pointer;
                    font-family: var(--font-paragraphs);
                }
                .btn-remove {
                    background: none;
                    border: none;
                    color: #ccc;
                    font-size: 0.7rem;
                    padding: 0;
                    cursor: pointer;
                    text-decoration: underline;
                    letter-spacing: 1px;
                }
                .btn-remove:hover { color: #f44336; }
                
                .col-price, .col-total {
                    font-family: var(--font-paragraphs);
                    font-size: 0.95rem;
                    color: #1a1a1a;
                }
                .col-total {
                    font-weight: 600;
                    color: var(--color-beige);
                    text-align: right;
                }

                .qty-control {
                    display: flex;
                    align-items: center;
                    border: 1px solid #ddd;
                    width: fit-content;
                }
                .qty-control button {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 1.2rem;
                    color: #666;
                }
                .qty-control span {
                    width: 30px;
                    text-align: center;
                    font-family: var(--font-paragraphs);
                    font-size: 0.85rem;
                }

                /* Mobile specific qty/price */
                .item-price-qty-row {
                    display: flex;
                    align-items: center;
                    gap: 1.2rem;
                    margin-top: 1rem;
                }
                .item-price-mobile {
                    font-family: var(--font-paragraphs);
                    color: #999;
                    font-size: 0.85rem;
                }
                .item-price-mobile span {
                    color: var(--color-beige);
                    font-weight: 600;
                    font-size: 0.95rem;
                }

                /* Sidebar */
                .summary-card {
                    background: #f9f9f9;
                    padding: 2.5rem;
                    border-radius: 8px;
                    position: sticky;
                    top: 120px;
                }
                .summary-card h2 {
                    font-family: var(--font-titles);
                    font-size: 1.2rem;
                    margin-bottom: 2rem;
                    letter-spacing: 1px;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 1.2rem;
                    font-family: var(--font-paragraphs);
                    font-size: 0.9rem;
                    color: #333;
                }
                .summary-row.total {
                    border-top: 1px solid #ddd;
                    padding-top: 1.5rem;
                    margin-top: 1.5rem;
                }
                .summary-row.total span {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #000;
                }
                .total-stack { text-align: right; }
                .total-amount { display: block; color: var(--color-beige) !important; font-size: 1.4rem !important; }
                .tax-info { font-size: 0.7rem; color: #999; font-weight: 400 !important; }

                .btn-checkout {
                    width: 100%;
                    margin-top: 2rem;
                    padding: 1.2rem;
                    background: var(--color-green);
                    color: #fff;
                    border: none;
                    font-family: var(--font-titles);
                    font-weight: 700;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: filter 0.3s;
                }
                .btn-checkout:hover { filter: brightness(1.2); }

                /* Empty state */
                .cart-page-empty {
                    padding: 15rem 0;
                    text-align: center;
                }
                .cart-page-empty h1 {
                    font-family: var(--font-titles);
                    font-size: 2rem;
                    color: var(--color-green);
                    margin-bottom: 1rem;
                }
                .cart-page-empty p {
                    margin-bottom: 2.5rem;
                    color: #666;
                }
                .btn-green {
                    display: inline-block;
                    padding: 1rem 3rem;
                    background: var(--color-green);
                    color: #fff;
                    text-decoration: none;
                    font-family: var(--font-titles);
                    letter-spacing: 2px;
                }

                @media (max-width: 1024px) {
                    .cart-grid { grid-template-columns: 1fr; }
                    .cart-sidebar { order: 1; }
                    .summary-card { position: static; }
                }

                @media (max-width: 768px) {
                    .cart-page-container { padding: 7rem 0 2rem 0rem; }
                    .cart-table-header { display: none; }
                    .mobile-only { display: flex; }
                    .desktop-only { display: none; }
                    
                    .cart-item-row {
                        display: flex;
                        gap: 1.2rem;
                        padding: 1.5rem 0;
                        border-bottom: 1px solid #f0f0f0;
                        text-align: left;
                        align-items: flex-start;
                    }
                    .item-info { 
                        flex: 1; 
                        flex-direction: row; 
                        align-items: flex-start;
                        gap: 1.2rem;
                        display: flex !important;
                    }
                    .item-img {
                        width: 90px;
                        height: 90px;
                        flex-shrink: 0;
                    }
                    .item-text {
                        flex: 1;
                    }
                    .item-text h3 {
                        font-size: 0.85rem;
                        margin-bottom: 0.2rem;
                    }
                    .item-meta {
                        gap: 0.1rem;
                        margin-bottom: 0.5rem;
                    }
                    .meta-field {
                        justify-content: flex-start;
                        font-size: 0.75rem;
                    }
                    .qty-control {
                        margin: 0;
                        border: 1px solid #e0e0e0;
                    }
                    .qty-control button {
                        width: 24px;
                        height: 24px;
                        font-size: 1rem;
                    }
                    .qty-control span {
                        width: 26px;
                        font-size: 0.75rem;
                    }
                }
            `}</style>
        </div>
    );
}

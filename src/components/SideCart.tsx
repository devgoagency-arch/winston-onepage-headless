import { useStore } from '@nanostores/react';
import { cartItems, isCartOpen, removeFromCart, updateQuantity, updateCartItemVariation, type CartItem } from '../store/cart';
import { useEffect, useState, useMemo } from 'react';
import { redirectToCheckout } from '../utils/checkout';

export default function SideCart() {
    const $cartItems = useStore(cartItems);
    const $isCartOpen = useStore(isCartOpen);
    const [isClosing, setIsClosing] = useState(false);

    const items = useMemo(() => {
        return Object.entries($cartItems)
            .filter(([_, value]) => !!value) // Filtrar nulos o undefined para evitar errores de JSON.parse
            .map(([key, value]) => {
                try {
                    return {
                        key,
                        ...(JSON.parse(value) as CartItem)
                    };
                } catch (e) {
                    console.error("Error parsing cart item:", key, e);
                    return null;
                }
            })
            .filter((item): item is (CartItem & { key: string }) => item !== null);
    }, [$cartItems]);

    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [items]);

    useEffect(() => {
        if ($isCartOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [$isCartOpen]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            isCartOpen.set(false);
            setIsClosing(false);
        }, 300);
    };

    const handleCheckout = () => {
        redirectToCheckout('/checkout/');
    };

    const handleViewCart = () => {
        console.log("[SideCart] Navegando a /carrito");
        window.location.href = '/carrito';
    };

    if (!$isCartOpen && !isClosing) return null;

    return (
        <div className={`cart-overlay ${isClosing ? 'fade-out' : 'fade-in'}`} onClick={handleClose}>
            <div
                className={`side-cart ${isClosing ? 'slide-out' : 'slide-in'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="cart-header">
                    <h2>SHOPPING CART</h2>
                    <button className="close-cart" onClick={handleClose}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        <span>Cerrar</span>
                    </button>
                </div>

                <div className="cart-items modern-scroll">
                    {items.length === 0 ? (
                        <div className="empty-cart">
                            <h2 style={{ textAlign: 'center', margin: '80% 0px' }}>Tu carrito está vacío</h2>
                            <button className="btn-buy" onClick={handleClose}>Seguir Comprando</button>
                        </div>
                    ) : (
                        items.map((item) => {
                            const colorAttr = item.attributes?.find(a => {
                                const name = String(a.name || '').toLowerCase();
                                const id = String(a.id || '').toLowerCase();
                                return name.includes('color') || id.includes('color') || name.includes('selecciona-el-color');
                            });
                            const sizeAttr = item.attributes?.find(a => {
                                const name = String(a.name || '').toLowerCase();
                                const id = String(a.id || '').toLowerCase();
                                return name.includes('talla') || id.includes('talla') ||
                                    name.includes('size') || id.includes('size') ||
                                    name.includes('tamano') || name.includes('tamaño') ||
                                    name.includes('numero') || name.includes('nmero') ||
                                    name.includes('selecciona-una-talla');
                            });

                            return (
                                <div key={item.key} className="cart-item">
                                    <div className="item-image">
                                        <img src={item.image} alt={item.name} />
                                    </div>
                                    <div className="item-details">
                                        <div className="item-title-row">
                                            <h3>{item.name}</h3>
                                            <button className="item-remove-x" onClick={() => removeFromCart(item.key)}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M18 6L6 18M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="item-variants-selectors">
                                            <div className="selector-field">
                                                <label>Selecciona el Color:</label>
                                                {colorAttr ? (
                                                    <select
                                                        value={item.color || ''}
                                                        onChange={(e) => updateCartItemVariation(item.key, e.target.value, item.size)}
                                                        className="minimal-select"
                                                    >
                                                        <option value="" disabled>Elegir</option>
                                                        {(colorAttr.terms || colorAttr.options || []).map((term: any) => {
                                                            const val = typeof term === 'string' ? term : (term.slug || term.name);
                                                            const lab = typeof term === 'string' ? term : term.name;
                                                            return <option key={val} value={val}>{lab}</option>;
                                                        })}
                                                    </select>
                                                ) : (
                                                    <span className="v-value">{item.color || 'N/A'}</span>
                                                )}
                                            </div>

                                            <div className="selector-field">
                                                <label>Selecciona una Talla:</label>
                                                {sizeAttr ? (
                                                    <select
                                                        value={item.size || ''}
                                                        onChange={(e) => updateCartItemVariation(item.key, item.color, e.target.value)}
                                                        className="minimal-select"
                                                    >
                                                        <option value="" disabled>Elegir</option>
                                                        {(sizeAttr.terms || sizeAttr.options || []).map((term: any) => {
                                                            const val = typeof term === 'string' ? term : (term.slug || term.name);
                                                            const lab = typeof term === 'string' ? term : term.name;
                                                            return <option key={val} value={val}>{lab}</option>;
                                                        })}
                                                    </select>
                                                ) : (
                                                    <span className="v-value">{item.size || 'N/A'}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="item-price-qty-row">
                                            <div className="qty-selector">
                                                <button onClick={() => updateQuantity(item.key, item.quantity - 1)}>−</button>
                                                <span className="qty-number">{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.key, item.quantity + 1)}>+</button>
                                            </div>
                                            <div className="item-price-calc">
                                                × <span>${new Intl.NumberFormat('es-CO').format(item.price)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {items.length > 0 && (
                    <div className="cart-footer">
                        <div className="footer-top">
                            <span className="subtotal-label">Subtotal:</span>
                            <div className="price-stack">
                                <span className="subtotal-value">
                                    ${new Intl.NumberFormat('es-CO').format(subtotal)}
                                </span>
                                <span className="tax-note">(con impuestos)</span>
                            </div>
                        </div>
                        <div className="cart-actions">
                            <button className="btn-action btn-beige" onClick={handleViewCart}>
                                VER CARRITO
                            </button>
                            <button className="btn-action btn-green" onClick={handleCheckout}>
                                FINALIZAR COMPRA
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .cart-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    z-index: 2000;
                    display: flex;
                    justify-content: flex-end;
                }

                .side-cart {
                    width: 100%;
                    max-width: 450px;
                    height: 100%;
                    background: #fff;
                    display: flex;
                    flex-direction: column;
                    box-shadow: -10px 0 30px rgba(0,0,0,0.1);
                }

                .cart-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2.5rem 2rem;
                    background: #fff;
                    border-bottom: 1px solid #f9f9f9;
                }

                .cart-header h2 {
                    font-family: var(--font-titles, 'Antonio', sans-serif);
                    font-size: 1.4rem;
                    color: var(--color-green, #155338);
                    letter-spacing: 1px;
                    font-weight: 700;
                    margin: 0;
                }

                .close-cart {
                    background: none;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.9rem;
                    color: #1a1a1a;
                    font-family: var(--font-paragraphs, sans-serif);
                }

                .cart-items {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0 2rem;
                }

                .modern-scroll::-webkit-scrollbar { width: 5px; }
                .modern-scroll::-webkit-scrollbar-track { background: #f9f9f9; }
                .modern-scroll::-webkit-scrollbar-thumb { background: #bbb; border-radius: 10px; }

                .cart-item {
                    display: flex;
                    gap: 1.2rem;
                    padding: 1.5rem 0;
                    border-bottom: 1px solid #f0f0f0;
                }

                .item-image {
                    width: 65px;
                    height: 65px;
                    flex-shrink: 0;
                    background: #f6f6f6;
                    border-radius: 4px;
                    overflow: hidden;
                }
                .item-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .item-details {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                }

                .item-title-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .item-details h3 {
                    font-size: 0.8rem;
                    margin: 0;
                    text-transform: uppercase;
                    font-weight: 400;
                    font-family: var(--font-products);
                    letter-spacing: 0.5px;
                    color: var(--color-green);
                }

                .item-remove-x {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #ccc;
                    padding: 0;
                    font-size: 1.2rem;
                }

                .item-variants-selectors {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    margin-bottom: 0.5rem;
                }

                .selector-field {
                    font-size: 0.8rem;
                    color: #1a1a1a;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .selector-field label {
                    color: #1a1a1a;
                }

                .minimal-select {
                    border: none;
                    padding: 0;
                    font-size: 0.8rem;
                    background: transparent;
                    color: #999;
                    cursor: pointer;
                    font-family: var(--font-paragraphs, sans-serif);
                    text-decoration: none;
                    opacity: 0.8;
                }
                .minimal-select:hover { opacity: 1; }

                .v-value {
                    color: #999;
                }

                .item-price-qty-row {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-top: 5px;
                }

                .qty-selector {
                    display: flex;
                    align-items: center;
                    border: 1px solid #e0e0e0;
                    padding: 0;
                    background: #fff;
                }
                .qty-selector button {
                    width: 24px;
                    height: 26px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #666;
                }
                .qty-number {
                    width: 24px;
                    text-align: center;
                    font-size: 0.8rem;
                    font-family: var(--font-paragraphs, sans-serif);
                }

                .item-price-calc {
                    font-size: 0.8rem;
                    color: #999;
                    font-family: var(--font-paragraphs);
                }
                .item-price-calc span {
                    color: #B1915F; /* Tono dorado/beige de la imagen */
                    font-weight: 500;
                    margin-left: 5px;
                    font-size: 1rem;
                    font-family: var(--font-paragraphs, sans-serif);
                }

                .cart-footer {
                    padding: 2.5rem 2rem;
                    background: #fff;
                    border-top: 1px solid #f0f0f0;
                }

                .footer-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 2.5rem;
                }

                .subtotal-label {
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: #1a1a1a;
                    font-family: var(--font-paragraphs, sans-serif);
                }

                .price-stack {
                    text-align: right;
                }

                .subtotal-value {
                    display: block;
                    font-size: 1.2rem;
                    font-weight: 600;
                    color: #B1915F;
                    line-height: 1;
                    font-family: var(--font-paragraphs, sans-serif);
                }

                .tax-note {
                    display: block;
                    font-size: 0.75rem;
                    color: #aaa;
                    margin-top: 5px;
                }

                .cart-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .btn-action, .btn-buy {
                    width: 100%;
                    padding: 1.2rem;
                    font-family: var(--font-titles, 'Antonio', sans-serif);
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    border: none;
                    cursor: pointer;
                    font-size: 0.95rem;
                    transition: all 0.3s ease;
                }

                .btn-beige {
                    background-color: #B1915F;
                    color: #fff;
                }
                .btn-green, .btn-buy {
                    background-color: #155338;
                    color: #fff;
                }
                .btn-action:hover {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                }

                .slide-in { animation: slideIn 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
                .slide-out { animation: slideOut 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
                .fade-in { animation: fadeIn 0.3s ease forwards; }
                .fade-out { animation: fadeOut 0.3s ease forwards; }

                @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
            `}</style>
        </div>
    );
}

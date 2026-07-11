
import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { cartItems, removeFromCart, updateQuantity, updateCartItemVariation, calculateComboDiscount, type CartItem } from '../store/cart';
import { redirectToCheckout } from '../utils/checkout';
import { trackMetaEvent } from '../utils/metaPixel';
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

    const [shippingSettings, setShippingSettings] = React.useState({ flat_rate: 21008, free_shipping_threshold: 100000 });
    const [couponCode, setCouponCode] = React.useState('');

    React.useEffect(() => {
        fetch('/api/shipping-settings')
            .then(res => res.json())
            .then(data => {
                if (data.flat_rate !== undefined) setShippingSettings(data);
            })
            .catch(err => console.error("Error fetching shipping settings:", err));
    }, []);

    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [items]);

React.useEffect(() => {
        // RASTREADOR 1: Verifica si el componente se monta en el cliente
        console.log("1. React useEffect disparado. Cantidad de items:", items ? items.length : 0);

        if (!items || items.length === 0) {
            console.log("2. El estado global del carrito está vacío o aún no hidrata. Abortando envío a GTM.");
            return;
        }

        const gtmFlag = `gtm_cart_${items.length}_${subtotal}`;
        if (sessionStorage.getItem(gtmFlag)) {
            console.log("3. Bloqueo activo: El evento GTM ya se envió en esta sesión.");
            return;
        }

        (window as any).dataLayer = (window as any).dataLayer || [];
        (window as any).dataLayer.push({ ecommerce: null });
        (window as any).dataLayer.push({
            event: 'view_cart',
            ecommerce: {
                currency: 'COP',
                value: subtotal,
                items: items.map((item: any, index: number) => ({
                    item_id: String(item.id),
                    item_name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    index: index
                }))
            }
        });

        sessionStorage.setItem(gtmFlag, 'true');
        console.log("4. ✅ GTM TRACKING EXITOSO: view_cart");
    }, [items, subtotal]);

    const discount = useMemo(() => {
        return calculateComboDiscount(items);
    }, [items]);

    const FREE_SHIPPING_THRESHOLD = shippingSettings.free_shipping_threshold;
    const SHIPPING_COST = shippingSettings.flat_rate;
    const discountedSubtotal = subtotal - discount;
    const shippingCost = discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    const total = discountedSubtotal + shippingCost;

    const handleCheckout = () => {
        if (typeof window !== 'undefined') {
            (window as any).dataLayer = (window as any).dataLayer || [];
            (window as any).dataLayer.push({
                event: 'begin_checkout',
                currency: 'COP', value: total,
                items: items.map(item => ({ item_id: String(item.id), item_name: item.name, price: item.price, quantity: item.quantity }))
            });
            trackMetaEvent('InitiateCheckout', {
                content_ids: items.map(item => String(item.id)), content_type: 'product', value: total, currency: 'COP', num_items: items.length
            });
        }
        window.location.href = couponCode ? `/checkout?coupon=${couponCode}` : '/checkout';
    };

    const handleApplyCoupon = () => {
        if (!couponCode.trim()) return;
        // Por ahora redirigimos al checkout aplicando el cupón
        handleCheckout();
    };

    if (items.length === 0) {
        return (
            <div className="cart-page-empty-dark">
                <div className="cart-empty-backdrop"></div>
                <div className="cart-empty-card">
                    <span className="cart-empty-badge">CARRITO VACÍO</span>
                    <h1 className="cart-empty-title">TU CARRITO ESTÁ VACÍO</h1>
                    <p className="cart-empty-description">
                        Parece que no has añadido nada aún.
                        Nuestros maestros artesanos cuidan cada detalle en nuestros zapatos, y queremos cuidar también de tu experiencia de compra.
                    </p>
                    
                    <div className="cart-empty-helper">
                        <h2>¿QUÉ ESTABAS BUSCANDO?</h2>
                        <div className="cart-empty-grid">
                            <a href="/categoria/zapatos-cuero-hombre" className="cart-empty-link">
                                <span className="nav-title">Calzado de Cuero</span>
                                <span className="nav-arrow">→</span>
                            </a>
                            <a href="/categoria/ropa-hombre-colombia" className="cart-empty-link">
                                <span className="nav-title">Ropa Masculina</span>
                                <span className="nav-arrow">→</span>
                            </a>
                            <a href="/categoria/maletas-morrales-cuero" className="cart-empty-link">
                                <span className="nav-title">Morrales y Maletas</span>
                                <span className="nav-arrow">→</span>
                            </a>
                            <a href="/categoria/accesorios-hombre" className="cart-empty-link">
                                <span className="nav-title">Accesorios Finos</span>
                                <span className="nav-arrow">→</span>
                            </a>
                        </div>
                    </div>

                    <div className="cart-empty-actions">
                        <a href="/tienda" className="btn-empty-primary">VOLVER A LA TIENDA</a>
                    </div>
                </div>
                <style>{`
                    .cart-page-empty-dark {
                        position: relative;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 136px 2rem 80px 2rem;
                        background-color: #0b1512;
                        background-image: radial-gradient(circle at center, #10241f 0%, #0b1512 100%);
                        overflow: hidden;
                        z-index: 1;
                    }
                    .cart-empty-backdrop {
                        position: absolute;
                        top: 0; left: 0; width: 100%; height: 100%;
                        opacity: 0.05;
                        background-image: url('https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-zapatos-mocasines-m.jpg');
                        background-size: cover;
                        background-position: center;
                        z-index: -1;
                        filter: grayscale(1) blur(4px);
                    }
                    .cart-empty-card {
                        max-width: 700px; width: 100%;
                        background: rgba(255, 255, 255, 0.03);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                        padding: 4rem; border-radius: 4px;
                        box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
                        text-align: center;
                        animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                    }
                    .cart-empty-badge {
                        display: inline-block;
                        font-family: var(--font-paragraphs, sans-serif);
                        font-size: 0.75rem; letter-spacing: 3px; color: #d1b894;
                        margin-bottom: 1.5rem; font-weight: 600; text-transform: uppercase;
                        border-bottom: 1px solid rgba(209, 184, 148, 0.3); padding-bottom: 4px;
                    }
                    .cart-empty-title {
                        font-family: var(--font-titles, serif);
                        font-size: 2.2rem; letter-spacing: 4px; color: #ffffff !important;
                        margin: 0 0 1.5rem 0; line-height: 1.2; text-transform: uppercase;
                    }
                    .cart-empty-description {
                        font-family: var(--font-paragraphs, sans-serif);
                        font-size: 0.95rem; line-height: 1.8; color: #b0b8b5;
                        margin: 0 auto 3rem auto; max-width: 580px;
                    }
                    .cart-empty-helper {
                        border-top: 1px solid rgba(255, 255, 255, 0.08);
                        padding-top: 2rem; margin-bottom: 3rem; text-align: left;
                    }
                    .cart-empty-helper h2 {
                        font-family: var(--font-titles, serif);
                        font-size: 0.85rem; letter-spacing: 2px; color: #ffffff;
                        text-transform: uppercase; margin-bottom: 1.5rem; font-weight: 500;
                    }
                    .cart-empty-grid {
                        display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
                    }
                    .cart-empty-link {
                        display: flex; justify-content: space-between; align-items: center;
                        padding: 1.2rem; background: rgba(255, 255, 255, 0.02);
                        border: 1px solid rgba(255, 255, 255, 0.04);
                        text-decoration: none !important; transition: all 0.3s ease; border-radius: 2px;
                    }
                    .cart-empty-link:hover {
                        background: rgba(209, 184, 148, 0.06); border-color: rgba(209, 184, 148, 0.3);
                    }
                    .cart-empty-link .nav-title {
                        font-family: var(--font-paragraphs, sans-serif);
                        font-size: 0.85rem; color: #ffffff; letter-spacing: 0.5px; transition: color 0.3s ease;
                    }
                    .cart-empty-link:hover .nav-title {
                        color: #d1b894;
                    }
                    .cart-empty-link .nav-arrow {
                        color: #d1b894; font-size: 1rem; transition: transform 0.3s ease;
                    }
                    .cart-empty-link:hover .nav-arrow {
                        transform: translateX(4px);
                    }
                    .cart-empty-actions {
                        display: flex; justify-content: center; gap: 1.5rem;
                    }
                    .btn-empty-primary {
                        display: inline-block; background-color: #d1b894; color: #0b1512 !important;
                        font-family: var(--font-paragraphs, sans-serif);
                        font-size: 0.8rem; font-weight: 600; letter-spacing: 2px;
                        padding: 1.2rem 2.5rem; border-radius: 2px; text-decoration: none !important;
                        transition: all 0.3s ease; border: 1px solid #d1b894;
                    }
                    .btn-empty-primary:hover {
                        background-color: transparent; color: #d1b894 !important;
                        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
                    }
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @media (max-width: 768px) {
                        .cart-empty-card { padding: 2.5rem 1.5rem; }
                        .cart-empty-title { font-size: 1.6rem; letter-spacing: 2px; }
                        .cart-empty-grid { grid-template-columns: 1fr; }
                        .cart-empty-actions { flex-direction: column; gap: 1rem; }
                        .btn-empty-primary { width: 100%; text-align: center; }
                    }
                `}</style>
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

                        <div className="cart-actions-bottom">
                            <div className="coupon-wrapper">
                                <input
                                    type="text"
                                    placeholder="Código de cupón"
                                    className="coupon-input"
                                    value={couponCode}
                                    onChange={(e) => setCouponCode(e.target.value)}
                                />
                                <button className="btn-apply-coupon" onClick={handleApplyCoupon}>
                                    APLICAR CUPÓN
                                </button>
                            </div>
                            <a href="/tienda" className="continue-shopping">← CONTINUAR COMPRANDO</a>
                        </div>
                    </div>

                    <div className="cart-sidebar">
                        <div className="summary-card">
                            <h2>RESUMEN DE COMPRA</h2>
                            <div className="summary-row">
                                <span>Subtotal</span>
                                <span>${new Intl.NumberFormat('es-CO').format(subtotal)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="summary-row" style={{ color: '#d9534f' }}>
                                    <span>Descuento Combo -25%</span>
                                    <span>-${new Intl.NumberFormat('es-CO').format(discount)}</span>
                                </div>
                            )}
                            <div className="summary-row">
                                <span>Envío</span>
                                {shippingCost === 0 ? (
                                    <span className="shipping-free">Gratis</span>
                                ) : (
                                    <span className="shipping-cost">${new Intl.NumberFormat('es-CO').format(shippingCost)}</span>
                                )}
                            </div>
                            {shippingCost > 0 && (
                                <div className="shipping-notice">
                                    Agrega ${new Intl.NumberFormat('es-CO').format(FREE_SHIPPING_THRESHOLD - discountedSubtotal)} más para envío gratis
                                </div>
                            )}
                            <div className="summary-row total">
                                <span>Total</span>
                                <div className="total-stack">
                                    <span className="total-amount">${new Intl.NumberFormat('es-CO').format(total)}</span>
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
                
                .cart-actions-bottom {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 3rem;
                    padding-top: 2rem;
                    border-top: 1px solid #eee;
                }
                
                .coupon-wrapper {
                    display: flex;
                    gap: 10px;
                    align-items: stretch;
                }
                
                .coupon-input {
                    background: #f4f4f4;
                    border: 1px solid #e0e0e0;
                    padding: 0 1.5rem;
                    height: 50px;
                    width: 240px;
                    font-family: var(--font-paragraphs);
                    font-size: 0.85rem;
                    outline: none;
                }
                
                .coupon-input:focus {
                    border-color: var(--color-beige);
                }
                
                .btn-apply-coupon {
                    height: 50px;
                    padding: 0 2rem;
                    background: transparent;
                    border: 1px solid var(--color-green);
                    color: var(--color-green);
                    font-family: var(--font-titles);
                    font-weight: 700;
                    font-size: 0.9rem;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: all 0.3s;
                    white-space: nowrap;
                }
                
                .btn-apply-coupon:hover {
                    background: var(--color-green);
                    color: #fff;
                }
                
                .continue-shopping {
                    font-family: var(--font-titles);
                    font-size: 0.8rem;
                    color: #999;
                    text-decoration: none;
                    letter-spacing: 1px;
                }
                
                .continue-shopping:hover {
                    color: var(--color-green);
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
                .shipping-free { color: var(--color-green); font-weight: 600; }
                .shipping-cost { color: #c0392b; font-weight: 600; }
                .shipping-notice {
                    font-size: 0.72rem;
                    color: var(--color-green);
                    background: #f0f7f3;
                    border: 1px solid #c3e0d0;
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 1rem;
                    text-align: center;
                }

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

                    /* New responsive fixes */
                    .cart-page-title {
                        margin-bottom: 2rem;
                        padding: 0 1rem;
                    }

                    .cart-actions-bottom {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 1.5rem;
                        margin-top: 2rem;
                    }

                    .coupon-wrapper {
                        flex-direction: column;
                    }

                    .coupon-input {
                        width: 100%;
                    }

                    .continue-shopping {
                        text-align: center;
                    }

                    .summary-card {
                        padding: 1.5rem;
                    }

                    .total-amount {
                        font-size: 1.2rem !important;
                    }
                    
                    .container {
                        padding: 0 1rem;
                    }
                }
            `}</style>
        </div>
    );
}

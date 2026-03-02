import { useStore } from '@nanostores/react';
import { cartItems, isCartOpen, removeFromCart, updateQuantity, type CartItem } from '../store/cart';
import { useEffect, useState, useMemo } from 'react';

export default function SideCart() {
    const $cartItems = useStore(cartItems);
    const $isCartOpen = useStore(isCartOpen);
    const [isClosing, setIsClosing] = useState(false);

    const items = useMemo(() => {
        return Object.entries($cartItems).map(([key, value]) => ({
            key,
            ...(JSON.parse(value) as CartItem)
        }));
    }, [$cartItems]);

    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [items]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            isCartOpen.set(false);
            setIsClosing(false);
        }, 300);
    };

    const handleCheckout = () => {
        if (items.length === 0) return;

        // Dominio limpio de WordPress
        const wpDomain = 'https://winstonandharrystore.com';

        // Generamos la cadena ID:QTY
        const itemsQuery = items.map(item => `${item.id}:${item.quantity}`).join(',');

        // Importante: No ponemos /checkout/ al final si WP va a redireccionar, 
        // lo enviamos a la raiz con el parametro para que el bridge lo capture de inmediato
        const checkoutUrl = `${wpDomain}/?fill_cart=${itemsQuery}`;

        console.log("Redirecting to:", checkoutUrl);
        window.location.href = checkoutUrl;
    };

    const handleViewCart = () => {
        // Redirect to WordPress Cart
        window.location.href = 'https://winstonandharrystore.com/cart/';
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        <span>Cerrar</span>
                    </button>
                </div>

                <div className="cart-items">
                    {items.length === 0 ? (
                        <div className="empty-cart">
                            <p>Tu carrito está vacío</p>
                            <button className="btn-buy" onClick={handleClose}>Seguir Comprando</button>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div key={item.key} className="cart-item">
                                <div className="item-image">
                                    <img src={item.image} alt={item.name} />
                                </div>
                                <div className="item-details">
                                    <div className="item-title-row">
                                        <h3>{item.name}</h3>
                                        <button className="item-remove-x" onClick={() => removeFromCart(item.key)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6L6 18M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <p className="item-variant">
                                        Selecciona el Color: <span>{item.color || 'N/A'}</span>
                                    </p>
                                    <p className="item-variant">
                                        Selecciona una Talla: <span>{item.size || 'N/A'}</span>
                                    </p>
                                    <div className="item-price-qty">
                                        {item.quantity} × <span>${new Intl.NumberFormat('es-CO').format(item.price)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )
                    }
                </div>

                {items.length > 0 && (
                    <div className="cart-footer">
                        <div className="subtotal-row">
                            <span className="subtotal-label">Subtotal:</span>
                            <div className="subtotal-price-group">
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
                    background: rgba(0,0,0,0.4);
                    backdrop-filter: blur(4px);
                    z-index: 2000;
                    display: flex;
                    justify-content: flex-end;
                }

                .side-cart {
                    width: 100%;
                    max-width: 450px;
                    height: 100%;
                    background: #fff;
                    box-shadow: -10px 0 30px rgba(0,0,0,0.1);
                    display: flex;
                    flex-direction: column;
                    padding: 0;
                    position: relative;
                }

                .cart-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2.5rem 2rem;
                    border-bottom: 1px solid #f2f2f2;
                }

                .cart-header h2 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.1rem;
                    margin: 0;
                    color: var(--color-green);
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    font-weight: 700;
                }

                .close-cart {
                    background: none;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: #121212;
                    font-family: var(--font-paragraphs);
                    font-size: 0.9rem;
                    font-weight: 400;
                }

                .cart-items {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.5rem 2rem;
                }

                .cart-item {
                    display: flex;
                    gap: 1.2rem;
                    margin-bottom: 1.5rem;
                    padding-bottom: 1.5rem;
                    border-bottom: 1px solid #f2f2f2;
                    position: relative;
                }

                .item-image {
                    width: 80px;
                    height: 80px;
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
                }

                .item-title-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 0.4rem;
                }

                .item-details h3 {
                    font-size: 0.85rem;
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
                    color: #999;
                    cursor: pointer;
                    padding: 0;
                    transition: color 0.2s;
                }

                .item-remove-x:hover {
                    color: #d32f2f;
                }

                .item-variant {
                    font-size: 0.8rem;
                    color: #121212;
                    margin: 2px 0;
                    font-family: var(--font-paragraphs);
                }

                .item-variant span {
                    color: #999;
                    margin-left: 2px;
                }

                .item-price-qty {
                    margin-top: 0.5rem;
                    font-size: 0.85rem;
                    color: #ccc;
                    font-family: var(--font-paragraphs);
                }

                .item-price-qty span {
                    color: var(--color-beige);
                    font-weight: 500;
                }

                .cart-footer {
                    border-top: 1px solid #eee;
                    padding: 2.5rem 2rem;
                }

                .subtotal-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2rem;
                }

                .subtotal-label {
                    font-size: 1.2rem;
                    font-weight: 600;
                    color: #333;
                    font-family: var(--font-paragraphs);
                }

                .subtotal-price-group {
                    text-align: right;
                }

                .subtotal-value {
                    display: block;
                    font-size: 1.4rem;
                    font-weight: 700;
                    color: var(--color-beige);
                    font-family: var(--font-paragraphs);
                }

                .tax-note {
                    font-size: 0.75rem;
                    color: #999;
                    font-family: var(--font-paragraphs);
                }

                .cart-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 0.8rem;
                }

                .btn-action {
                    width: 100%;
                    border: none;
                    padding: 1.2rem;
                    font-family: var(--font-paragraphs);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    cursor: pointer;
                    transition: var(--transition-smooth);
                    font-size: 0.85rem;
                }

                .btn-beige {
                    background: var(--color-beige);
                    color: #fff;
                }

                .btn-beige:hover {
                    opacity: 0.9;
                }

                .btn-green {
                    background: var(--color-green);
                    color: #fff;
                }

                .btn-green:hover {
                    background: #000;
                }

                .empty-cart {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 50%;
                    gap: 1.5rem;
                }

                .slide-in { animation: slideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
                .slide-out { animation: slideOut 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
                .fade-in { animation: fadeIn 0.4s ease-out; }
                .fade-out { animation: fadeOut 0.4s ease-in forwards; }

                @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }

                @media (max-width: 480px) {
                    .side-cart { max-width: 100%; }
                }
            `}</style>
        </div>
    );
}

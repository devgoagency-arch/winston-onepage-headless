import { useEffect, useState } from 'react';
import { clearCart } from '../../store/cart';
import { trackMetaEvent } from '../../utils/metaPixel';

const parseColPrice = (val: any): number => {
    if (!val) return 0;
    const str = String(val);
    // Remover puntos de miles y reemplazar coma decimal si existe
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
};

interface OrderData {
    id: number;
    number: string;
    email: string;
    total: any;
    shipping_total?: any;
    total_tax?: any;
    items?: any[];
}

export default function OrderConfirmation() {
    const [order, setOrder] = useState<OrderData | null>(null);

    useEffect(() => {
        const raw = sessionStorage.getItem('wh_last_order');

        if (raw) {
            const parsedOrder = JSON.parse(raw);
            setOrder(parsedOrder);
            sessionStorage.removeItem('wh_last_order');
            clearCart();

            const alreadyTracked = sessionStorage.getItem('tracked_order_' + parsedOrder.id);
            if (!alreadyTracked) {
                // ⚠️ FIX TIMING: esperar a que GTM/Partytown inicialice el dataLayer
                // antes de hacer push mediante un setInterval
                dispatchWhenReady(parsedOrder);
            }
        } else {
            // FALLBACK: el sessionStorage no está (usuario llegó directo, recargó, etc.)
            // Leer order_id del query param que viene de Mercado Pago
            const params = new URLSearchParams(window.location.search);
            const orderId = params.get('order_id') || params.get('external_reference');
            if (orderId && !sessionStorage.getItem('tracked_order_' + orderId)) {
                fetch(`/api/get-order?id=${orderId}`)
                    .then(r => r.json())
                    .then(orderData => {
                        if (orderData?.id) {
                            setOrder(orderData);
                            // Validar estado contra el backend para evitar trackear rechazos o abandonos
                            const validStatuses = ['processing', 'completed', 'on-hold'];
                            if (validStatuses.includes(orderData.status)) {
                                dispatchWhenReady(orderData);
                            } else {
                                console.log('[GA4 Purchase Debug] Compra no trackeada debido a estado:', orderData.status);
                            }
                        }
                    })
                    .catch(err => console.error('Error fetching order for tracking:', err));
            }
        }
    }, []);

    function dispatchWhenReady(order: any) {
        // Al empujar directamente al dataLayer (que es un array normal antes de que GTM cargue),
        // no necesitamos esperar a que GTM ni Partytown estén listos. GTM procesará 
        // la cola automáticamente en cuanto se inicialice.
        fireTrackingEvents(order);
    }

    // Extraer la lógica de tracking a una función separada para reutilizarla
    function fireTrackingEvents(order: any) {
        const orderTotal = parseColPrice(order.total);
        const orderItems = order.items || [];

        console.log('[GA4 Purchase Debug]', { 
            orderTotal, 
            rawTotal: order.total, 
            items: orderItems 
        });

        // Aseguramos que el objeto dataLayer exista
        (window as any).dataLayer = (window as any).dataLayer || [];

        // 1. Limpiar objeto ecommerce previo para evitar variables fantasma
        (window as any).dataLayer.push({ ecommerce: null });

        // 2. Empujar el evento con formato GA4 estricto para GTM
        (window as any).dataLayer.push({
            event: 'purchase',
            ecommerce: {
                transaction_id: String(order.id),
                currency: 'COP',
                value: orderTotal,
                items: orderItems.map((item: any) => ({
                    item_id: String(item.id),
                    item_name: item.name,
                    price: parseColPrice(item.price || item.total),
                    quantity: item.quantity
                }))
            }
        });

        // Meta Pixel
        trackMetaEvent('Purchase', {
            content_ids: orderItems.map((item: any) => String(item.id)),
            content_type: 'product',
            value: orderTotal,
            currency: 'COP',
            num_items: orderItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)
        }, {
            // Pasar email como userData para mejorar el matching
            em: order.email?.toLowerCase().trim()
        });

        sessionStorage.setItem('tracked_order_' + order.id, 'true');
    }

    return (
        <>
            <div className="confirmation-page">
                <div className="confirmation-box">
                    <div className="check-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    </div>

                    <h1>¡Gracias por tu compra!</h1>

                    {order ? (
                        <>
                            <p className="order-number">
                                Pedido <strong>#{order.number}</strong>
                            </p>
                            <p className="order-email">
                                Recibirás una confirmación en <strong>{order.email}</strong>
                            </p>
                        </>
                    ) : (
                        <p className="order-email">Tu pedido ha sido recibido.</p>
                    )}

                    <p className="order-note">
                        Nuestro equipo procesará tu pedido y te contactará para coordinar la entrega.
                        Si tienes dudas escríbenos a{' '}
                        <a href="mailto:info@winstonandharrystore.com">
                            info@winstonandharrystore.com
                        </a>
                    </p>

                    {order?.items && order.items.length > 0 && (
                        <div className="order-summary">
                            <h2>Resumen de tu pedido</h2>
                            <div className="order-items">
                                {order.items.map((item: any, idx: number) => (
                                    <div key={idx} className="order-item">
                                        {item.image && (
                                            <div className="item-image">
                                                <img src={item.image} alt={item.name} />
                                            </div>
                                        )}
                                        <div className="item-details">
                                            <h3>{item.name}</h3>
                                            {(item.color || item.size || (item.attributes && item.attributes.length > 0)) && (
                                                <div className="item-variants">
                                                    {item.color && <span>Color: {item.color}</span>}
                                                    {item.size && <span>Talla: {item.size}</span>}
                                                    {item.attributes && item.attributes.map((attr: any, i: number) => (
                                                        <span key={i}>{attr.key}: {attr.value}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="item-qty-price">
                                            <span className="qty">Cant: {item.quantity}</span>
                                            <span className="price">${parseColPrice(item.price || item.total).toLocaleString('es-CO')}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="order-totals">
                                <div className="total-row">
                                    <span>Subtotal:</span>
                                    <span>${(order.items.reduce((acc: number, item: any) => acc + (parseColPrice(item.price || item.total) * item.quantity), 0)).toLocaleString('es-CO')}</span>
                                </div>
                                {order.shipping_total !== undefined && (
                                    <div className="total-row">
                                        <span>Envío:</span>
                                        <span>{parseColPrice(order.shipping_total) === 0 ? 'Gratuito' : `$${parseColPrice(order.shipping_total).toLocaleString('es-CO')}`}</span>
                                    </div>
                                )}
                                {order.total_tax !== undefined && parseColPrice(order.total_tax) > 0 && (
                                    <div className="total-row">
                                        <span>Impuestos:</span>
                                        <span>${parseColPrice(order.total_tax).toLocaleString('es-CO')}</span>
                                    </div>
                                )}
                                <div className="total-row grand-total">
                                    <span>Total Pagado:</span>
                                    <span>${parseColPrice(order.total).toLocaleString('es-CO')}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="confirmation-actions">
                        {order && (
                            <a href="/mi-cuenta/pedidos" className="btn-green">
                                Ver mis pedidos
                            </a>
                        )}
                        <a href="/" className="btn-outline">
                            Seguir comprando
                        </a>
                    </div>
                </div>
            </div>

            <style>{`
                .confirmation-page {
                    --green: #155338;
                    --beige: #B1915F;
                    --line:  #f0f0f0;
                    min-height: 70vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 60px 20px;
                    font-family: var(--font-paragraphs, sans-serif);
                }
                .confirmation-box {
                    max-width: 520px;
                    width: 100%;
                    text-align: center;
                }
                .check-icon {
                    width: 72px;
                    height: 72px;
                    border-radius: 50%;
                    background: #f0f7f3;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                    color: var(--green);
                }
                h1 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.25rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: var(--green);
                    margin: 0 0 16px;
                }
                .order-number {
                    font-size: 1rem;
                    color: #333;
                    margin-bottom: 8px;
                }
                .order-email {
                    font-size: 0.88rem;
                    color: #666;
                    margin-bottom: 24px;
                }
                .order-note {
                    font-size: 0.82rem;
                    color: #888;
                    line-height: 1.6;
                    margin-bottom: 32px;
                    padding: 16px;
                    background: #fafafa;
                    border: 1px solid var(--line);
                }
                .order-note a { color: var(--green); }
                .confirmation-actions {
                    display: flex;
                    gap: 16px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin-top: 32px;
                }
                .btn-green {
                    display: inline-block;
                    padding: 14px 28px;
                    background: var(--green);
                    color: #fff;
                    font-family: var(--font-titles, sans-serif);
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-decoration: none;
                    transition: filter 0.2s;
                    border-radius: 4px;
                }
                .btn-green:hover { filter: brightness(1.1); color: #fff; }
                .btn-outline {
                    display: inline-block;
                    padding: 14px 28px;
                    background: transparent;
                    color: var(--green);
                    border: 1px solid var(--green);
                    font-family: var(--font-titles, sans-serif);
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-decoration: none;
                    transition: all 0.2s;
                    border-radius: 4px;
                }
                .btn-outline:hover { background: var(--green); color: #fff; }
            `}</style>
        </>
    );
}

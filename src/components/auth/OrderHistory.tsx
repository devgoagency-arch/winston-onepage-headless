
import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userSession } from '../../store/user';

const OrderHistory: React.FC = () => {
    const session = useStore(userSession);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (session.id) {
            fetch(`/api/auth/orders?customerId=${session.id}`)
                .then(res => res.json())
                .then(data => {
                    setOrders(data);
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        }
    }, [session.id]);

    if (loading) return <div className="loading-dots">Cargando tus pedidos...</div>;

    if (orders.length === 0) {
        return (
            <div className="empty-orders">
                <p>Aún no has realizado ningún pedido.</p>
                <a href="/#tienda" className="btn-primary">Ir a la tienda</a>
            </div>
        );
    }

    return (
        <div className="orders-table-container">
            <table className="orders-table">
                <thead>
                    <tr>
                        <th>Pedido</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th>Total</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((order) => (
                        <tr key={order.id}>
                            <td className="order-number">#{order.number}</td>
                            <td>{new Date(order.date_created).toLocaleDateString('es-ES')}</td>
                            <td>
                                <span className={`status-badge ${order.status}`}>
                                    {order.status.toUpperCase()}
                                </span>
                            </td>
                            <td className="order-total">${parseFloat(order.total).toLocaleString('es-ES')}</td>
                            <td>
                                <a href={`https://tienda.winstonandharrystore.com/mi-cuenta/view-order/${order.id}/`} target="_blank" className="view-btn">
                                    Detalles
                                </a>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <style>{`
                .orders-table-container {
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                }
                .orders-table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                }
                .orders-table th {
                    background: #f8f8f8;
                    padding: 1.2rem;
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #888;
                }
                .orders-table td {
                    padding: 1.5rem 1.2rem;
                    border-bottom: 1px solid #f0f0f0;
                    font-size: 0.95rem;
                }
                .order-number {
                    font-weight: 700;
                    color: var(--color-green);
                }
                .status-badge {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 800;
                }
                .status-badge.completed { background: #dcfce7; color: #166534; }
                .status-badge.processing { background: #fef9c3; color: #854d0e; }
                .status-badge.cancelled { background: #fee2e2; color: #991b1b; }
                
                .order-total {
                    font-weight: 600;
                }
                .view-btn {
                    color: var(--color-gold, #c4a47c);
                    font-weight: 700;
                    text-decoration: none;
                    font-size: 0.85rem;
                }
                .empty-orders {
                    text-align: center;
                    padding: 4rem;
                }
            `}</style>
        </div>
    );
};

export default OrderHistory;

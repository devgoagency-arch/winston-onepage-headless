import { useState, useEffect } from 'react';

interface Product {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    prices: {
        price: string;
        regular_price: string;
        sale_price: string;
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
}

export default function Wishlist() {
    const [favorites, setFavorites] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadFavorites = () => {
            const stored = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
            setFavorites(stored);
            setLoading(false);
        };

        loadFavorites();

        // Listen for updates from other tabs/components
        window.addEventListener('storage', loadFavorites);
        return () => window.removeEventListener('storage', loadFavorites);
    }, []);

    const removeFavorite = (id: number) => {
        const newFavorites = favorites.filter(p => p.id !== id);
        setFavorites(newFavorites);
        localStorage.setItem('wh_favorites', JSON.stringify(newFavorites));
        window.dispatchEvent(new Event('storage'));
    };

    const formatPrice = (p: Product['prices']) => {
        const price = parseInt(p.price) / (10 ** (p.currency_minor_unit || 0));
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: p.currency_code,
            minimumFractionDigits: 0
        }).format(price);
    };

    if (loading) return <div className="loading">Cargando...</div>;

    if (favorites.length === 0) {
        return (
            <div className="empty-wishlist">
                <p>Tu lista de deseos está vacía.</p>
                <a href="/#tienda" className="btn-shop">Ir a la tienda</a>
            </div>
        );
    }

    return (
        <div className="wishlist-container">
            {favorites.map(product => (
                <div key={product.id} className="wishlist-item">
                    <div className="item-image">
                        <img
                            src={product.images[0]?.src || 'https://via.placeholder.com/300x400?text=Sin+Imagen'}
                            alt={product.images[0]?.alt || product.name}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.onerror = null;
                                target.src = 'https://via.placeholder.com/300x400?text=Sin+Imagen';
                            }}
                        />
                    </div>

                    <div className="item-details">
                        <h3><a href={`/productos/${product.slug}`}>{product.name}</a></h3>
                        <p className="item-price">{formatPrice(product.prices)}</p>
                        <p className="stock-status">Disponible</p> {/* Placeholder logic */}
                        <div className="item-actions-mobile">
                            <a href={`/productos/${product.slug}`} className="action-link add-link">Ver Producto</a>
                            <button onClick={() => removeFavorite(product.id)} className="action-link remove-link">Eliminar</button>
                        </div>
                    </div>

                    <div className="item-actions-desktop">
                        <a href={`/productos/${product.slug}`} className="btn-view">Ver Opciones</a>
                        <button onClick={() => removeFavorite(product.id)} className="btn-remove">
                            Eliminar
                        </button>
                    </div>
                </div>
            ))}

            <style>{`
                .wishlist-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .wishlist-item {
                    display: flex;
                    align-items: center;
                    border: 1px solid #f0f0f0;
                    padding: 1rem;
                    background: #fff;
                    transition: box-shadow 0.3s ease;
                    gap: 1.5rem;
                }

                .wishlist-item:hover {
                    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
                }

                .item-image {
                    width: 100px;
                    height: 100px;
                    flex-shrink: 0;
                    background: #f6f6f6;
                }

                .item-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .item-details {
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .item-details h3 {
                    margin: 0;
                    font-family: var(--font-products, sans-serif);
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    font-weight: 300;
                    letter-spacing: 0.5px;
                }

                .item-details h3 a {
                    color: #121212;
                    text-decoration: none;
                }

                .item-price {
                    font-weight: 400;
                    color: #a3a3a3;
                    font-size: 0.85rem;
                    font-family: var(--font-products, sans-serif);
                }

                .stock-status {
                    color: #708090;
                    font-size: 0.75rem;
                    font-weight: 400;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                /* Mobile Actions hidden on desktop */
                .item-actions-mobile {
                    display: none;
                    gap: 1rem;
                    margin-top: 0.5rem;
                    font-size: 0.85rem;
                }

                .action-link {
                    background: none;
                    border: none;
                    cursor: pointer;
                    text-decoration: underline;
                    padding: 0;
                }
                
                .add-link { color: var(--color-green); }
                .remove-link { color: #d32f2f; }

                /* Desktop Actions */
                .item-actions-desktop {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 0.5rem;
                    min-width: 150px;
                }

                .btn-view {
                    background-color: var(--color-green);
                    color: #fff;
                    padding: 0.5rem 1rem;
                    text-decoration: none;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    text-align: center;
                    display: block;
                    width: 100%;
                }

                .btn-remove {
                    background: none;
                    border: none;
                    color: #999;
                    font-size: 0.8rem;
                    text-decoration: underline;
                    cursor: pointer;
                }
                
                .btn-remove:hover { color: #d32f2f; }

                .empty-wishlist {
                    text-align: center;
                    padding: 3rem;
                }

                .btn-shop {
                    display: inline-block;
                    margin-top: 1rem;
                    padding: 0.8rem 2rem;
                    background: var(--color-green);
                    color: #fff;
                    text-decoration: none;
                    text-transform: uppercase;
                }

                @media (max-width: 768px) {
                    .wishlist-item { align-items: flex-start; }
                    .item-actions-desktop { display: none; }
                    .item-actions-mobile { display: flex; }
                    .item-image { width: 100px; height: 100px; }
                }
            `}</style>
        </div>
    );
}

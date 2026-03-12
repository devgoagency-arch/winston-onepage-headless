
import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userSession } from '../../store/user';
import LoginForm from './LoginForm';
import { logout } from '../../lib/auth';

const AuthSection: React.FC = () => {
    const session = useStore(userSession);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setIsLoaded(true);
    }, []);

    if (!isLoaded) return <div className="loading">Cargando...</div>;

    if (session.token) {
        return (
            <div className="account-dashboard">
                <header className="dashboard-header">
                    <h1>Hola, {session.user_display_name}</h1>
                    <p>Bienvenido a tu panel personal de Winston & Harry.</p>
                </header>

                <div className="dashboard-grid">
                    <div className="dashboard-card">
                        <h3>Mis Pedidos</h3>
                        <p>Consulta el estado de tus compras y descarga tus facturas.</p>
                        <a href="https://tienda.winstonandharrystore.com/mi-cuenta/orders/" target="_blank" className="btn-outline">Ver Pedidos</a>
                    </div>
                    <div className="dashboard-card">
                        <h3>Mis Favoritos</h3>
                        <p>Echa un vistazo a los productos que guardaste para después.</p>
                        <a href="/lista-de-deseos" className="btn-outline">Ir a Favoritos</a>
                    </div>
                    <div className="dashboard-card">
                        <h3>Detalles de la cuenta</h3>
                        <p>Actualiza tu dirección de envío y contraseña.</p>
                        <a href="https://tienda.winstonandharrystore.com/mi-cuenta/edit-account/" target="_blank" className="btn-outline">Editar Perfil</a>
                    </div>
                </div>

                <div className="dashboard-footer">
                    <button onClick={logout} className="logout-btn">Cerrar Sesión</button>
                </div>

                <style>{`
                    .account-dashboard {
                        max-width: 900px;
                        margin: 0 auto;
                        padding: 4rem 2rem;
                    }
                    .dashboard-header {
                        text-align: center;
                        margin-bottom: 4rem;
                    }
                    .dashboard-header h1 {
                        font-family: var(--font-fancy, serif);
                        font-size: 3rem;
                        color: var(--color-green);
                    }
                    .dashboard-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                        gap: 2rem;
                    }
                    .dashboard-card {
                        background: white;
                        padding: 2.5rem;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                        text-align: center;
                        transition: transform 0.3s;
                    }
                    .dashboard-card:hover {
                        transform: translateY(-5px);
                    }
                    .dashboard-card h3 {
                        margin-bottom: 1rem;
                        color: var(--color-green);
                        font-family: var(--font-fancy, serif);
                        font-size: 1.5rem;
                    }
                    .dashboard-card p {
                        color: #666;
                        font-size: 0.95rem;
                        margin-bottom: 2rem;
                        line-height: 1.5;
                    }
                    .btn-outline {
                        display: inline-block;
                        padding: 0.8rem 1.5rem;
                        border: 1px solid var(--color-green);
                        color: var(--color-green);
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 600;
                        transition: all 0.3s;
                    }
                    .btn-outline:hover {
                        background: var(--color-green);
                        color: white;
                    }
                    .dashboard-footer {
                        margin-top: 4rem;
                        text-align: center;
                    }
                    .logout-btn {
                        background: none;
                        border: none;
                        color: #999;
                        text-decoration: underline;
                        cursor: pointer;
                        font-size: 0.9rem;
                    }
                    .logout-btn:hover {
                        color: var(--color-green);
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="auth-wrapper">
            <LoginForm />
        </div>
    );
};

export default AuthSection;

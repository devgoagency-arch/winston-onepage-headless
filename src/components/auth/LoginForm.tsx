
import React, { useState } from 'react';
import { login } from '../../lib/auth';

interface LoginFormProps {
    onSwitchToRegister: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const result = await login(username, password);

        if (result.success) {
            // Éxito: El store se actualiza automáticamente en lib/auth
            // Redirigimos o refrescamos
            window.location.href = '/mi-cuenta';
        } else {
            setError(result.message || 'Error al iniciar sesión');
            setLoading(false);
        }
    };

    return (
        <div className="login-form-container">
            <h2>Bienvenido a Winston & Harry</h2>
            <p className="subtitle">Identifícate para acceder a tus pedidos y favoritos.</p>

            <form onSubmit={handleSubmit} className="auth-form">
                {error && <div className="error-message">{error}</div>}

                <div className="form-group">
                    <label htmlFor="username">Usuario o Email</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        placeholder="ej. juan@correo.com"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="password">Contraseña</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                    />
                </div>

                <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </button>

                <div className="form-footer">
                    <a href="https://tienda.winstonandharrystore.com/mi-cuenta/lost-password/" target="_blank" rel="noopener noreferrer">
                        ¿Olvidaste tu contraseña?
                    </a>
                </div>

                <div className="form-divider"> O </div>

                <div className="register-promo">
                    <p>¿No tienes una cuenta aún?</p>
                    <button type="button" onClick={onSwitchToRegister} className="btn-secondary">
                        Crea una Cuenta Nueva
                    </button>
                </div>
            </form>

            <style>{`
                .login-form-container {
                    padding: 3rem 2.5rem;
                    background: white;
                    border-radius: 8px;
                    max-width: 550px;
                    margin: 2rem auto;
                    box-shadow: 0 4px 25px rgba(0,0,0,0.05);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .form-divider {
                    text-align: center;
                    margin: 1.5rem 0;
                    color: #ccc;
                    position: relative;
                    width: 100%;
                }
                .form-divider::before, .form-divider::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    width: 42%;
                    height: 1px;
                    background: #eee;
                }
                .form-divider::before { left: 0; }
                .form-divider::after { right: 0; }
                
                .register-promo {
                    text-align: center;
                    width: 100%;
                }
                .register-promo p {
                    font-size: 0.95rem;
                    color: #666;
                    margin-bottom: 1.2rem;
                }
                .btn-secondary {
                    background: white;
                    color: var(--color-green);
                    border: 1px solid var(--color-green);
                    padding: 1rem 1.5rem;
                    border-radius: 4px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    cursor: pointer;
                    transition: all 0.3s;
                    width: 100%;
                    font-family: var(--font-titles);
                }
                .btn-secondary:hover {
                    background: #f0f4f2;
                    border-color: var(--color-beige);
                    color: var(--color-beige);
                }
                h2 {
                    font-family: var(--font-titles);
                    font-size: 1.25rem;
                    color: var(--color-green);
                    margin-bottom: 0.5rem;
                    text-align: center;
                    letter-spacing: 2px;
                }
                .subtitle {
                    text-align: center;
                    color: #666;
                    margin-bottom: 2.5rem;
                    font-size: 0.95rem;
                    line-height: 1.4;
                    max-width: 400px;
                }
                .auth-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    width: 100%;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.6rem;
                }
                .form-group label {
                    font-weight: 600;
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: #888;
                    font-family: var(--font-titles);
                }
                .form-group input {
                    padding: 1rem;
                    border: 1px solid #eee;
                    border-radius: 4px;
                    font-size: 1rem;
                    transition: border-color 0.3s;
                    background-color: #fafafa;
                }
                .form-group input:focus {
                    outline: none;
                    border-color: var(--color-beige);
                    background-color: white;
                }
                .btn-primary {
                    background: var(--color-green);
                    color: white;
                    padding: 1.2rem;
                    border: none;
                    border-radius: 4px;
                    font-size: 1rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: all 0.3s;
                    margin-top: 1rem;
                    font-family: var(--font-titles);
                }
                .btn-primary:hover {
                    background: var(--color-beige);
                    transform: translateY(-2px);
                }
                .btn-primary:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                .error-message {
                    background: #fee2e2;
                    color: #dc2626;
                    padding: 0.8rem;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    text-align: center;
                }
                .form-footer {
                    text-align: center;
                    margin-top: 1rem;
                }
                .form-footer a {
                    color: #666;
                    font-size: 0.85rem;
                    text-decoration: underline;
                }
            `}</style>
        </div>
    );
};

export default LoginForm;

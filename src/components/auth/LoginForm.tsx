
import React, { useState } from 'react';
import { login } from '../../lib/auth';

const LoginForm: React.FC = () => {
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
            </form>

            <style>{`
                .login-form-container {
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    max-width: 450px;
                    margin: 0 auto;
                }
                h2 {
                    font-family: var(--font-fancy, serif);
                    font-size: 2rem;
                    color: var(--color-green);
                    margin-bottom: 0.5rem;
                    text-align: center;
                }
                .subtitle {
                    text-align: center;
                    color: #666;
                    margin-bottom: 2rem;
                    font-size: 0.9rem;
                }
                .auth-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .form-group label {
                    font-weight: 500;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .form-group input {
                    padding: 0.8rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 1rem;
                    transition: border-color 0.3s;
                }
                .form-group input:focus {
                    outline: none;
                    border-color: var(--color-gold, #c4a47c);
                }
                .btn-primary {
                    background: var(--color-green);
                    color: white;
                    padding: 1rem;
                    border: none;
                    border-radius: 4px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.3s;
                    margin-top: 1rem;
                }
                .btn-primary:hover {
                    background: #153c30;
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

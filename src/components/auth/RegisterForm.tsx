
import React, { useState } from 'react';
import { register } from '../../lib/auth';

interface RegisterFormProps {
    onSwitchToLogin: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const result = await register(email, password, firstName, lastName);

        if (result.success) {
            window.location.href = '/mi-cuenta';
        } else {
            setError(result.message || 'Error al crear la cuenta');
            setLoading(false);
        }
    };

    return (
        <div className="login-form-container register-form-container">
            <h2>Crea tu Cuenta</h2>
            <p className="subtitle">Únete a la familia Winston & Harry y disfruta de una experiencia única.</p>

            <form onSubmit={handleSubmit} className="auth-form">
                {error && <div className="error-message">{error}</div>}
                
                <div className="name-row">
                    <div className="form-group">
                        <label htmlFor="firstName">Nombre</label>
                        <input
                            type="text"
                            id="firstName"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            required
                            placeholder="Tu nombre"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="lastName">Apellido</label>
                        <input
                            type="text"
                            id="lastName"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            required
                            placeholder="Tu apellido"
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label htmlFor="email">Correo Electrónico</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        placeholder="Mínimo 8 caracteres"
                        minLength={8}
                    />
                </div>

                <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Creando cuenta...' : 'Registrarse'}
                </button>

                <div className="form-footer">
                    <span>¿Ya tienes una cuenta? </span>
                    <button type="button" onClick={onSwitchToLogin} className="switch-btn">
                        Inicia Sesión
                    </button>
                </div>
            </form>

            <style>{`
                .register-form-container {
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
                    margin-top: 2rem;
                    font-size: 0.9rem;
                    color: #666;
                }
                .name-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.5rem;
                }
                .switch-btn {
                    background: none;
                    border: none;
                    color: var(--color-green);
                    font-weight: 700;
                    text-decoration: underline;
                    cursor: pointer;
                    font-size: 0.9rem;
                    padding: 0;
                    margin-left: 5px;
                    transition: color 0.3s;
                }
                .switch-btn:hover {
                    color: var(--color-beige);
                }
                @media (max-width: 580px) {
                    .register-form-container {
                        margin: 1rem;
                        padding: 2rem 1.5rem;
                    }
                    .name-row {
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                    }
                }
            `}</style>
        </div>
    );
};

export default RegisterForm;

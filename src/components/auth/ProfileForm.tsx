
import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userSession, setUserSession } from '../../store/user';

const ProfileForm: React.FC = () => {
    const session = useStore(userSession);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (session.token) {
            fetch('/api/auth/profile', {
                headers: { 'Authorization': `Bearer ${session.token}` }
            })
            .then(res => res.json())
            .then(data => {
                setFormData({
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    email: data.email || ''
                });
                setLoading(false);
            })
            .catch(() => setLoading(false));
        }
    }, [session.token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/auth/profile', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: 'Perfil actualizado correctamente.' });
                // Actualizamos el nombre mostrado en el dashboard
                setUserSession({
                    ...session,
                    user_display_name: `${formData.first_name} ${formData.last_name}`.trim() || session.user_display_name
                });
            } else {
                setMessage({ type: 'error', text: data.error || 'Error al guardar.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Error de conexión.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="loading-profile">Cargando tus datos...</div>;

    return (
        <div className="profile-form-wrapper">
            <form onSubmit={handleSubmit} className="premium-form">
                <div className="form-grid">
                    <div className="form-group">
                        <label>Nombre</label>
                        <input 
                            type="text" 
                            value={formData.first_name}
                            onChange={e => setFormData({...formData, first_name: e.target.value})}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Apellido</label>
                        <input 
                            type="text" 
                            value={formData.last_name}
                            onChange={e => setFormData({...formData, last_name: e.target.value})}
                            required
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label>Correo Electrónico</label>
                    <input 
                        type="email" 
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        required
                    />
                </div>

                {message.text && (
                    <div className={`form-message ${message.type}`}>
                        {message.text}
                    </div>
                )}

                <div className="form-actions">
                    <button type="submit" className="btn-save" disabled={saving}>
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                    <p className="password-note">
                        Para cambiar tu contraseña, usa el enlace de <a href={`https://tienda.winstonandharrystore.com/mi-cuenta/edit-account/?autologin=${session.token}`} target="_blank">seguridad avanzado</a>.
                    </p>
                </div>
            </form>

            <style>{`
                .profile-form-wrapper {
                    background: white;
                    padding: 3rem;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                    max-width: 800px;
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 2rem;
                    margin-bottom: 2rem;
                }
                @media (max-width: 600px) {
                    .form-grid { grid-template-columns: 1fr; gap: 1rem; }
                    .profile-form-wrapper { padding: 1.5rem; }
                }
                .form-group {
                    margin-bottom: 1.5rem;
                }
                .form-group label {
                    display: block;
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #888;
                    margin-bottom: 8px;
                    font-weight: 600;
                    font-family: var(--font-paragraphs, sans-serif);
                }
                .form-group input {
                    width: 100%;
                    padding: 1rem;
                    border: 1px solid #e0e0e0;
                    border-radius: 4px;
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 1rem;
                    transition: border-color 0.3s;
                }
                .form-group input:focus {
                    outline: none;
                    border-color: var(--color-green);
                }
                .btn-save {
                    background: var(--color-green);
                    color: white;
                    border: none;
                    padding: 1rem 2.5rem;
                    border-radius: 4px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    cursor: pointer;
                    transition: all 0.3s;
                    font-family: var(--font-titles, sans-serif);
                }
                .btn-save:hover {
                    filter: brightness(1.2);
                    transform: translateY(-2px);
                }
                .btn-save:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                .form-message {
                    padding: 1rem;
                    border-radius: 4px;
                    margin-bottom: 2rem;
                    font-size: 0.9rem;
                    font-weight: 600;
                    text-align: center;
                }
                .form-message.success { background: #dcfce7; color: #166534; }
                .form-message.error { background: #fee2e2; color: #991b1b; }
                
                .form-actions {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 1.5rem;
                    margin-top: 1rem;
                }
                .password-note {
                    font-size: 0.85rem;
                    color: #999;
                }
                .password-note a {
                    color: var(--color-gold);
                    text-decoration: underline;
                }
            `}</style>
        </div>
    );
};

export default ProfileForm;

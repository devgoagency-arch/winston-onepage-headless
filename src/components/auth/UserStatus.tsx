
import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userSession } from '../../store/user';

const UserStatus: React.FC = () => {
    const session = useStore(userSession);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setIsLoaded(true);
    }, []);

    // No renderizar nada hasta que el store esté hidratado en el cliente
    if (!isLoaded) return (
        <div className="action-btn-placeholder">
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.2" fill="none"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
        </div>
    );

    const displayName = session.user_display_name;

    return (
        <a href="/mi-cuenta" className={`action-btn user-btn ${session.token ? 'is-logged-in' : ''}`} aria-label="Mi Perfil">
            <div className="user-icon-wrapper">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                {session.token && <span className="user-dot"></span>}
            </div>
            {session.token && <span className="user-name-label">{displayName?.split(' ')[0]}</span>}

            <style>{`
                .user-icon-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .user-dot {
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    width: 7px;
                    height: 7px;
                    background: var(--color-gold, #c4a47c);
                    border-radius: 50%;
                    border: 1px solid white;
                }
                .user-name-label {
                    font-size: 0.7rem;
                    font-weight: 500;
                    margin-left: 5px;
                    display: none;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                @media (min-width: 1024px) {
                    .is-logged-in .user-name-label {
                        display: block;
                    }
                }
                .action-btn-placeholder {
                    opacity: 0.5;
                    padding: 8px;
                }
            `}</style>
        </a>
    );
};

export default UserStatus;

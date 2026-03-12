
import { persistentMap } from '@nanostores/persistent';
import { atom } from 'nanostores';

export interface User {
    token: string;
    user_email: string;
    user_nicename: string;
    user_display_name: string;
    id?: string;
}

// Store para la sesión del usuario (Persistente en localStorage)
export const userSession = persistentMap<Partial<User>>('wh_user_session', {});

// Estado para controlar la apertura del modal de login si fuera necesario
export const isLoginModalOpen = atom(false);

export function setUserSession(data: User) {
    userSession.set(data);
}

export function clearUserSession() {
    userSession.set({});
}

export function isUserLoggedIn() {
    const session = userSession.get();
    return !!session.token;
}


import { setUserSession, clearUserSession } from '../store/user';

export const WP_URL = import.meta.env.PUBLIC_WP_URL || 'https://tienda.winstonandharrystore.com';
const JWT_ENDPOINT = `${WP_URL}/wp-json/jwt-auth/v1/token`;

export async function login(username: string, password: string) {
    try {
        const response = await fetch(JWT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok && data.token) {
            // Obtenemos datos extra del usuario (como el ID real) usando el token
            const userRes = await fetch(`${WP_URL}/wp-json/wp/v2/users/me`, {
                headers: { 'Authorization': `Bearer ${data.token}` }
            });
            const userData = await userRes.json();

            setUserSession({
                token: data.token,
                user_email: data.user_email,
                user_nicename: data.user_nicename,
                user_display_name: data.user_display_name,
                id: userData.id?.toString() || '',
            });
            return { success: true, user: { ...data, id: userData.id } };
        } else {
            return { 
                success: false, 
                message: data.message || 'Error al iniciar sesión. Verifica tus credenciales.' 
            };
        }
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'No se pudo conectar con el servidor.' };
    }
}

export function logout() {
    clearUserSession();
    // Opcional: Redirigir o recargar la página si es necesario
    window.location.reload();
}

/**
 * Valida si el token actual sigue siendo válido
 */
export async function validateToken(token: string) {
    try {
        const response = await fetch(`${WP_URL}/wp-json/jwt-auth/v1/token/validate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

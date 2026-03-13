
import type { APIRoute } from 'astro';

const WC_KEY = import.meta.env.WC_CONSUMER_KEY;
const WC_SECRET = import.meta.env.WC_CONSUMER_SECRET;
const WP_URL = import.meta.env.WC_URL || 'https://tienda.winstonandharrystore.com';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { email, password, firstName, lastName } = body;

        if (!email || !password) {
            return new Response(JSON.stringify({ message: 'Email y contraseña son requeridos' }), { status: 400 });
        }

        // Crear cliente en WooCommerce
        const auth = btoa(`${WC_KEY}:${WC_SECRET}`);
        const response = await fetch(`${WP_URL}/wp-json/wc/v3/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            body: JSON.stringify({
                email,
                password,
                first_name: firstName,
                last_name: lastName,
                username: email.split('@')[0] + Math.floor(Math.random() * 1000) // Generar username básico
            })
        });

        const data = await response.json();

        if (response.ok) {
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Usuario registrado con éxito',
                user: data 
            }), { status: 200 });
        } else {
            // Manejar errores de WordPress (ej: email ya existe)
            let errorMessage = 'Error al registrar usuario';
            if (data.code === 'registration-error-email-exists') {
                errorMessage = 'Este correo electrónico ya está registrado.';
            } else if (data.message) {
                errorMessage = data.message;
            }
            
            return new Response(JSON.stringify({ 
                success: false, 
                message: errorMessage 
            }), { status: response.status });
        }

    } catch (error) {
        console.error('Registration API Error:', error);
        return new Response(JSON.stringify({ message: 'Error interno del servidor' }), { status: 500 });
    }
};

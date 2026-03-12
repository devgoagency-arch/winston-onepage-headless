
import { WP_URL } from "../../../lib/auth";

export async function POST({ request }: { request: Request }) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    try {
        const body = await request.json();
        
        // Actualizamos los datos en WordPress usando la API REST nativa
        const response = await fetch(`${WP_URL}/wp-json/wp/v2/users/me`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                first_name: body.first_name,
                last_name: body.last_name,
                email: body.email,
                nickname: body.first_name // Actualizamos el nickname también
            })
        });

        const data = await response.json();

        if (response.ok) {
            return new Response(JSON.stringify({ success: true, user: data }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ error: data.message || "Error al actualizar" }), { status: response.status });
        }
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

export async function GET({ request }: { request: Request }) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    try {
        const response = await fetch(`${WP_URL}/wp-json/wp/v2/users/me?context=edit`, {
            headers: { 'Authorization': authHeader }
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

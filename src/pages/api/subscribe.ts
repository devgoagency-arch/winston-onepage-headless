import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const { email, phone, firstname, lastname, pageUri, pageName } = data;

        const portalId = import.meta.env.HUBSPOT_PORTAL_ID;
        const formId = import.meta.env.HUBSPOT_FORM_ID;

        const endpoint = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;

        const payload = {
            fields: [
                { name: 'email', value: email },
                { name: 'firstname', value: firstname },
                { name: 'lastname', value: lastname },
                { name: 'phone', value: phone }
            ],
            context: {
                pageUri: pageUri || 'https://winstonandharrystore.com',
                pageName: pageName || 'Winston & Harry'
            }
        };

        console.log('[HubSpot Debug] Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('[HubSpot Debug] Error:', JSON.stringify(result, null, 2));
            return new Response(JSON.stringify({ error: 'HubSpot error', details: result }), { status: response.status });
        }

        return new Response(JSON.stringify({ message: 'Success' }), { status: 200 });
    } catch (error) {
        console.error('[HubSpot Debug] Exception:', error);
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
};

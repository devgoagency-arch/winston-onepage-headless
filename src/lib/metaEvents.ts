/**
 * metaEvents.ts
 * Utilidad server-side: envía eventos a la Meta Conversions API.
 * Requiere la variable de entorno META_ACCESS_TOKEN.
 */

const PIXEL_ID = '533909598411848';

interface MetaEventPayload {
    eventName: string;
    eventId: string;
    eventSourceUrl: string;
    clientIp?: string;
    clientUserAgent?: string;
    userData?: Record<string, string>;
    customData?: Record<string, any>;
}

/**
 * Envía un evento a la Conversions API de Meta (server-side).
 * Silencia errores para no bloquear el flujo principal del usuario.
 */
export async function sendMetaServerEvent(payload: MetaEventPayload): Promise<void> {
    const accessToken = import.meta.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        console.warn('[MetaCAP] META_ACCESS_TOKEN no definido — evento no enviado al servidor');
        return;
    }

    // Normalizar value: siempre número
    const customData = { ...payload.customData };
    if (customData.value !== undefined) {
        customData.value = parseFloat(String(customData.value).replace(/[^0-9.]/g, '')) || 0;
    }
    // Normalizar currency: siempre 'COP' string ISO 4217
    customData.currency = 'COP';

    const body = {
        data: [
            {
                event_name: payload.eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: payload.eventId,
                event_source_url: payload.eventSourceUrl,
                action_source: 'website',
                user_data: {
                    client_ip_address: payload.clientIp || null,
                    client_user_agent: payload.clientUserAgent || null,
                    ...payload.userData,
                },
                custom_data: customData,
            },
        ],
    };

    try {
        const res = await fetch(
            `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
        );
        if (!res.ok) {
            const err = await res.text();
            console.error('[MetaCAP] Error de la API:', err);
        } else {
            console.log(`[MetaCAP] ✅ Evento "${payload.eventName}" enviado (id: ${payload.eventId})`);
        }
    } catch (e) {
        console.error('[MetaCAP] Fetch error:', e);
    }
}

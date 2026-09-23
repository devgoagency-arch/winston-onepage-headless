/**
 * metaEvents.ts
 * Utilidad server-side: envía eventos a la Meta Conversions API.
 * Requiere la variable de entorno META_ACCESS_TOKEN.
 */

import crypto from 'node:crypto';

const PIXEL_ID = '533909598411848';

/**
 * Campos PII que DEBEN hashearse con SHA-256 antes de enviarse a Meta.
 * Cualquier campo de userData que NO esté en esta lista se ignora (no se envía).
 * fbc, fbp, client_ip_address y client_user_agent van en texto plano — NO se hashean.
 * Ref: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */
const PII_FIELDS = new Set([
    'em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'db', 'ge', 'madid', 'external_id'
]);

/** Hashea PII usando SHA-256 (requerido por Meta) */
function hashData(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const normalized = value.toLowerCase().trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

interface MetaEventPayload {
    eventName: string;
    eventId: string;
    eventSourceUrl: string;
    clientIp?: string;
    clientUserAgent?: string;
    userData?: Record<string, string>;
    clientIds?: { fbc?: string; fbp?: string }; // cookies Meta: texto plano, sin hashear
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

    // Construir user_data separando correctamente cada tipo de campo:
    // - Campos PII (em, ph, etc.)  → hashear SHA-256
    // - IP y User-Agent            → texto plano, sin hashear (Meta los usa para matching)
    // - fbc y fbp                  → texto plano, sin hashear (son tokens de atribución)
    const hashedPII = Object.fromEntries(
        Object.entries(payload.userData || {})
            .filter(([k]) => PII_FIELDS.has(k))
            .map(([k, v]) => [k, hashData(v)])
            .filter((entry): entry is [string, string] => entry[1] !== undefined)
    );

    const user_data: Record<string, string | null> = {
        client_ip_address: payload.clientIp || null,
        client_user_agent: payload.clientUserAgent || null,
        ...hashedPII,
        // fbc/fbp van sin hash — Meta necesita el valor original para atribución de clics
        ...(payload.clientIds?.fbc ? { fbc: payload.clientIds.fbc } : {}),
        ...(payload.clientIds?.fbp ? { fbp: payload.clientIds.fbp } : {}),
    };

    const body = {
        data: [
            {
                event_name: payload.eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: payload.eventId,
                event_source_url: payload.eventSourceUrl,
                action_source: 'website',
                user_data,
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

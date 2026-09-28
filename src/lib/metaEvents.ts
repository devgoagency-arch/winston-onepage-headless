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

/**
 * Normaliza un número de teléfono colombiano al formato E.164 sin "+":
 * solo dígitos, con código de país 57 al inicio.
 *
 * Casos manejados:
 *   "3013902574"        → "573013902574"  (10 dígitos locales → prepend 57)
 *   "+57 301 390-2574"  → "573013902574"  (limpia y detecta 12 dígitos con 57)
 *   "57 3013902574"     → "573013902574"  (idem con espacio)
 *   "(301) 390-2574"    → "573013902574"  (limpia paréntesis y guiones)
 *
 * Devuelve undefined si el resultado no tiene 10 ni 12 dígitos (con prefijo 57)
 * para evitar hashear basura que Meta no puede usar para matching.
 * En ningún caso se imprime el valor en texto plano en los logs.
 */
function normalizePhone(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    // Quitar todo lo que no sea dígito
    const digits = raw.replace(/\D/g, '');
    // 12 dígitos que ya empiezan con 57 → ya está en formato correcto
    if (digits.startsWith('57') && digits.length === 12) return digits;
    // 10 dígitos → número local colombiano, anteponer 57
    if (digits.length === 10) return `57${digits}`;
    // Cualquier otra longitud → inválido, omitir del payload
    return undefined;
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

    // Pre-normalizar ph ANTES del hashing para garantizar formato E.164 sin "+".
    // Si normalizePhone devuelve undefined (número vacío, muy corto o formato inválido),
    // se elimina la clave del mapa → ph queda fuera del payload final sin romper nada.
    // El valor raw nunca se imprime en logs: solo el hash resultante sale en el payload.
    const normalizedUserData = { ...(payload.userData || {}) };
    if ('ph' in normalizedUserData) {
        const normalizedPhone = normalizePhone(normalizedUserData.ph);
        if (normalizedPhone) {
            normalizedUserData.ph = normalizedPhone;
        } else {
            delete normalizedUserData.ph; // número inválido → omitir ph del payload
        }
    }

    const hashedPII = Object.fromEntries(
        Object.entries(normalizedUserData)
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
            const responseData = await res.json();
            console.error('[MetaCAP] Error de la API:', JSON.stringify(responseData));
        } else {
            console.log(`[MetaCAP] ✅ Evento "${payload.eventName}" enviado (id: ${payload.eventId})`);
        }
    } catch (e: any) {
        console.error('[MetaCAP] Fetch error:', e?.message || e);
    }
}

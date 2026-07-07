/**
 * metaPixel.ts
 * Helper browser-side: reemplaza los fbq() directos del proyecto.
 *
 * Hace tres cosas:
 * 1. Genera un event_id único compartido entre browser y servidor (para deduplicación)
 * 2. Dispara fbq('track', ...) con ese eventID (tercer argumento de Meta)
 * 3. Llama a /api/meta-event en fire-and-forget para el tracking server-side
 */

/**
 * Genera un event_id reproducible y único por evento.
 * Formato: EventName_timestamp_random
 */
export function generateEventId(eventName: string): string {
    return `${eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normaliza el value: siempre número, sin símbolos ni separadores de miles.
 */
function normalizeValue(value: any): number {
    if (typeof value === 'number') return value;
    return parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
}

/**
 * Dispara un evento Meta Pixel en el browser Y lo envía server-side vía /api/meta-event.
 *
 * @param eventName  Nombre estándar Meta: 'PageView', 'ViewContent', 'AddToCart', etc.
 * @param customData Parámetros del evento (value, currency, content_ids, etc.)
 * @param userData   Datos opcionales del usuario para mejorar el matching (email hasheado, etc.)
 */
export function trackMetaEvent(
    eventName: string,
    customData: Record<string, any> = {},
    userData: Record<string, string> = {}
): void {
    if (typeof window === 'undefined') return;

    // 1. Generar event_id único para deduplicación browser ↔ servidor
    const eventId = generateEventId(eventName);

    // 2. Normalizar parámetros obligatorios
    const normalized: Record<string, any> = { ...customData };
    if (normalized.value !== undefined) {
        normalized.value = normalizeValue(normalized.value);
    }
    // currency: siempre 'COP' (ISO 4217), nunca símbolo ni número
    normalized.currency = 'COP';

    // 3. Browser: fbq('track', eventName, customData, { eventID })
    //    El tercer argumento { eventID } es lo que Meta usa para deduplicar
    if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', eventName, normalized, { eventID: eventId });
    }

    // 4. Server-side: fire-and-forget a /api/meta-event
    //    No await — no bloquea la UI aunque falle
    fetch('/api/meta-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            eventName,
            eventId,
            eventSourceUrl: window.location.href,
            customData: normalized,
            userData,
        }),
    }).catch((e) => {
        // Silencioso: el browser-side ya trackea aunque el server falle
        console.warn('[MetaPixel] Server-side event failed (silenced):', e?.message);
    });
}

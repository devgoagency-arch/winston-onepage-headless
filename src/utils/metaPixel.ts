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
 * Lee las cookies de Meta click ID (_fbc) y browser ID (_fbp).
 * - _fbc: si no existe cookie pero la URL tiene fbclid, lo construye manualmente
 *   con el formato oficial fb.1.<timestamp>.<fbclid> (cubre Safari/iOS con ITP).
 * - _fbp: lo genera el Pixel de Meta en el primer PageView; si no existe, se omite.
 * Ambos se devuelven sin hashear — Meta los requiere en texto plano en user_data.
 */
function getMetaClickIds(): { fbc?: string; fbp?: string } {
    if (typeof document === 'undefined') return {};

    const getCookie = (name: string): string | undefined => {
        const match = document.cookie
            .split(';')
            .map(c => c.trim())
            .find(c => c.startsWith(name + '='));
        return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : undefined;
    };

    let fbc = getCookie('_fbc');

    // Si no hay cookie _fbc pero la URL trae fbclid (caso típico en Safari con ITP),
    // construir el fbc manualmente con el formato estándar de Meta.
    if (!fbc) {
        const fbclid = new URLSearchParams(window.location.search).get('fbclid');
        if (fbclid) {
            fbc = `fb.1.${Date.now()}.${fbclid}`;
        }
    }

    let fbp = getCookie('_fbp');

    // Si _fbp no existe (usuario nuevo que aún no tuvo tiempo de cargar el SDK de Meta,
    // que se inicializa 2.5s después del load), generamos una sintética con el mismo
    // formato y algoritmo que usa fbevents.js internamente:
    //   fb.1.<timestamp_ms>.<uint32_sin_signo>
    // El SDK detecta la cookie en fbq('init', ...) con `if (existing) return existing`
    // y la usa sin modificar. Solo se activa cuando _fbp no existe — nunca sobrescribe.
    if (!fbp) {
        // Math.random() * 0x100000000 | 0 genera un entero sin signo de 32 bits,
        // idéntico al algoritmo interno de fbevents.js
        const syntheticFbp = `fb.1.${Date.now()}.${Math.random() * 0x100000000 | 0}`;
        try {
            const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
            document.cookie = `_fbp=${syntheticFbp}; expires=${expires}; path=/; SameSite=Lax`;
            fbp = syntheticFbp;
        } catch (e) {
            // Si no se puede escribir la cookie (navegadores muy restrictivos), omitir fbp
        }
    }

    // Solo incluir los campos que existen — nunca dejar undefined en el payload
    const result: { fbc?: string; fbp?: string } = {};
    if (fbc) result.fbc = fbc;
    if (fbp) result.fbp = fbp;
    return result;
}

/**
 * Dispara un evento Meta Pixel en el browser Y lo envía server-side vía /api/meta-event.
 *
 * @param eventName     Nombre estándar Meta: 'PageView', 'ViewContent', 'AddToCart', etc.
 * @param customData    Parámetros del evento (value, currency, content_ids, etc.)
 * @param userData      Datos PII del usuario para hashear SHA-256 en el servidor (em, ph).
 *                      Solo disponibles en eventos post-identificación (checkout, compra).
 * @param customEventId ID personalizado para deduplicación exacta (ej: order.id).
 */
export function trackMetaEvent(
    eventName: string,
    customData: Record<string, any> = {},
    userData: Record<string, string> = {},
    customEventId?: string
): void {
    if (typeof window === 'undefined') return;

    // 1. Generar event_id único para deduplicación browser ↔ servidor (o usar el custom)
    const eventId = customEventId || generateEventId(eventName);

    // 2. Normalizar parámetros obligatorios
    const normalized: Record<string, any> = { ...customData };
    if (normalized.value !== undefined) {
        normalized.value = normalizeValue(normalized.value);
    }
    // currency: siempre 'COP' (ISO 4217), nunca símbolo ni número
    normalized.currency = 'COP';

    // 3. Leer cookies de Meta (fbc/fbp) — texto plano, NO se hashean
    const clientIds = getMetaClickIds();

    // 4. Browser: fbq('track', eventName, customData, { eventID })
    //    El tercer argumento { eventID } es lo que Meta usa para deduplicar
    if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', eventName, normalized, { eventID: eventId });
    }

    // 5. Server-side: fire-and-forget a /api/meta-event
    //    - userData: PII que el servidor hasheará SHA-256 (em, ph)
    //    - clientIds: cookies Meta que el servidor pasa en texto plano (fbc, fbp)
    //    Separados para que el servidor no aplique hash donde no debe.
    fetch('/api/meta-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            eventName,
            eventId,
            eventSourceUrl: window.location.href,
            customData: normalized,
            userData,
            clientIds,
        }),
    }).catch((e) => {
        // Silencioso: el browser-side ya trackea aunque el server falle
        console.warn('[MetaPixel] Server-side event failed (silenced):', e?.message);
    });
}

// Lógica pura de /experiencia: sin DOM, para poder probarla en tests/experiencia.test.mjs.

export interface DatosSuscripcion {
    correo: string;
    telefono: string;
    nombre: string;
    apellido: string;
    datos: boolean;
}

export interface Contexto {
    textoDatos: string;
    pageUri: string;
    pageName: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO = /^\+?[\d\s()-]{7,20}$/;

/** Solo acepta qr/nfc; cualquier otro valor cuenta como acceso directo. */
export function normalizarOrigen(valor: string | null | undefined): 'qr' | 'nfc' | 'directo' {
    const limpio = (valor ?? '').trim().toLowerCase();
    return limpio === 'qr' || limpio === 'nfc' ? limpio : 'directo';
}

export function validarSuscripcion(d: DatosSuscripcion): Record<string, string> {
    const errores: Record<string, string> = {};
    if (!CORREO.test(d.correo.trim())) errores.correo = 'Escribe un correo válido.';
    if (!TELEFONO.test(d.telefono.trim())) errores.telefono = 'Escribe un teléfono válido.';
    if (d.nombre.trim().length < 2) errores.nombre = 'Escribe tu nombre.';
    if (d.apellido.trim().length < 2) errores.apellido = 'Escribe tu apellido.';
    if (!d.datos) errores.datos = 'Necesitamos tu autorización para registrar tus datos.';
    return errores;
}

/** Mismos campos que envía la suscripción del footer. */
export function armarEnvioHubspot(d: DatosSuscripcion, c: Contexto) {
    const campos: [string, string][] = [
        ['email', d.correo.trim()],
        ['mobilephone', d.telefono.trim()],
        ['firstname', d.nombre.trim()],
        ['lastname', d.apellido.trim()],
    ];
    return {
        fields: campos.map(([name, value]) => ({ objectTypeId: '0-1', name, value })),
        context: { pageUri: c.pageUri, pageName: c.pageName },
        legalConsentOptions: {
            consent: { consentToProcess: true, text: c.textoDatos },
        },
    };
}

/** Traduce la respuesta de error de HubSpot a un mensaje sin datos técnicos. */
export function errorHubspot(cuerpo: any): { campo?: string; mensaje: string } {
    const errores = Array.isArray(cuerpo?.errors) ? cuerpo.errors : [];
    if (errores.some((e: any) => e?.errorType === 'INVALID_EMAIL' || e?.errorType === 'BLOCKED_EMAIL')) {
        return { campo: 'correo', mensaje: 'Revisa tu correo: no pudimos aceptarlo.' };
    }
    return { mensaje: 'No pudimos completar tu suscripción. Inténtalo de nuevo en unos minutos.' };
}

import { HUBSPOT, TEXTO_DATOS } from '../config/experiencia';
import {
    armarEnvioHubspot,
    errorHubspot,
    normalizarOrigen,
    validarSuscripcion,
    type DatosSuscripcion,
} from '../lib/experiencia';

const LLAVE_ORIGEN = 'wh_experiencia_origen';
const TIEMPO_MAXIMO_MS = 12000;

function leerOrigen() {
    const delaUrl = normalizarOrigen(new URLSearchParams(window.location.search).get('origen'));
    try {
        if (delaUrl !== 'directo') sessionStorage.setItem(LLAVE_ORIGEN, delaUrl);
        return normalizarOrigen(sessionStorage.getItem(LLAVE_ORIGEN));
    } catch {
        return delaUrl;
    }
}

const origen = leerOrigen();

// GTM es la única vía a GA4: aquí solo se escribe en dataLayer y nunca van datos personales.
function medir(event: string, parametros: Record<string, string> = {}) {
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, origen, ...parametros });
}

function iniciarSuscripcion() {
    const form = document.querySelector<HTMLFormElement>('#exp-suscribe-form');
    if (!form) return;

    const boton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const estado = form.querySelector<HTMLElement>('#exp-estado')!;
    const exito = document.querySelector<HTMLElement>('#exp-suscribe-exito')!;
    let enviando = false;

    const pintarErrores = (errores: Record<string, string>) => {
        form.querySelectorAll<HTMLElement>('[data-error-de]').forEach((nodo) => {
            const campo = nodo.dataset.errorDe!;
            nodo.textContent = errores[campo] ?? '';
            const entrada = form.querySelector<HTMLInputElement>(`[name="${campo}"]`);
            entrada?.setAttribute('aria-invalid', errores[campo] ? 'true' : 'false');
        });
        const primero = Object.keys(errores)[0];
        if (primero) form.querySelector<HTMLInputElement>(`[name="${primero}"]`)?.focus();
    };

    const mostrarEstado = (mensaje: string) => {
        estado.textContent = mensaje;
        estado.hidden = !mensaje;
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (enviando) return;

        const f = new FormData(form);
        // Trampa para bots: el campo está oculto para personas.
        if (f.get('sitio')) return;

        const datos: DatosSuscripcion = {
            correo: String(f.get('correo') ?? ''),
            telefono: String(f.get('telefono') ?? ''),
            nombre: String(f.get('nombre') ?? ''),
            apellido: String(f.get('apellido') ?? ''),
            datos: f.get('datos') === 'on',
        };

        const errores = validarSuscripcion(datos);
        pintarErrores(errores);
        mostrarEstado('');
        if (Object.keys(errores).length) return;

        enviando = true;
        boton.disabled = true;
        boton.textContent = 'Enviando...';

        const control = new AbortController();
        const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);

        try {
            const respuesta = await fetch(
                `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT.portalId}/${HUBSPOT.formId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: control.signal,
                    body: JSON.stringify(
                        armarEnvioHubspot(datos, {
                            textoDatos: TEXTO_DATOS,
                            pageUri: window.location.href,
                            pageName: document.title,
                        }),
                    ),
                },
            );

            if (!respuesta.ok) {
                const { campo, mensaje } = errorHubspot(await respuesta.json().catch(() => null));
                if (campo) pintarErrores({ [campo]: mensaje });
                else mostrarEstado(mensaje);
                return;
            }

            medir('postpurchase_registration');
            medir('postpurchase_marketing_optin');

            form.hidden = true;
            exito.hidden = false;
            exito.focus();
            document.querySelector<HTMLElement>('#exp-novedades-invitacion')!.hidden = true;
        } catch {
            mostrarEstado('No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.');
        } finally {
            clearTimeout(reloj);
            enviando = false;
            boton.disabled = false;
            boton.textContent = 'Suscribirme';
        }
    });
}

function iniciarEnlaces() {
    document.addEventListener('click', (e) => {
        const enlace = (e.target as Element).closest<HTMLAnchorElement>('[data-exp-evento]');
        if (!enlace) return;
        const { expEvento, expCanal, expTienda, expArticulo } = enlace.dataset;
        const destino = enlace.href.split('?')[0];
        if (expEvento === 'blog') {
            medir('postpurchase_blog_click', { articulo: expArticulo ?? '', destino });
        } else {
            if (expTienda) medir('postpurchase_store_selected', { canal: expCanal ?? '', tienda: expTienda });
            medir('postpurchase_review_click', { canal: expCanal ?? '', tienda: expTienda ?? 'no_aplica', destino });
        }
    });
}

medir('postpurchase_page_view');
iniciarSuscripcion();
iniciarEnlaces();

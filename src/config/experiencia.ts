// Configuración central de la landing poscompra /experiencia.
// Enlaces, tiendas, guías y campos de HubSpot se cambian solo aquí.

export const SITIO = 'https://www.winstonandharrystore.com';

// Mismo formulario de suscripción del footer.
export const HUBSPOT = {
    portalId: '22727126',
    formId: '0723b68c-0294-4e45-aa9f-4fa00a102f50',
};

// Enlaces oficiales de reseña en Google: los mismos de los redirects /review-* de astro.config.mjs.
// `nota` y `total` se copian A MANO de cada ficha de Google Maps; revisarlos cada mes y actualizar GOOGLE_ACTUALIZADO.
export const GOOGLE_ACTUALIZADO = '2026-10';
export const TIENDAS = [
    { id: 'unicentro', nombre: 'C.C. Unicentro', imagen: '/images/store-unicentro.avif', nota: 4.6, total: 11, resena: 'https://g.page/r/CUpXPMxMDYUWEBM/review' },
    { id: 'retiro', nombre: 'C.C. El Retiro', imagen: '/images/store-retiro.avif', nota: 4.4, total: 58, resena: 'https://g.page/r/CSKXwQ5l5zSpEBM/review' },
    { id: 'santa_barbara', nombre: 'C.C. Hacienda Santa Bárbara', imagen: '/images/store-hacienda.avif', nota: 5.0, total: 26, resena: 'https://g.page/r/CfogiOsEUdgVEBM/review' },
    { id: 'palatino', nombre: 'C.C. Palatino', imagen: '/images/store-palatino.avif', nota: 1.0, total: 1, resena: 'https://g.page/r/CVqAdcaz3jkUEBM/review' },
];

// Promedio de las tiendas, ponderado por número de reseñas.
const totalGoogle = TIENDAS.reduce((suma, t) => suma + t.total, 0);
export const RESUMEN_GOOGLE = {
    total: totalGoogle,
    nota: TIENDAS.reduce((suma, t) => suma + t.nota * t.total, 0) / totalGoogle,
};

export const GUIAS = [
    {
        id: 'cuidado',
        titulo: 'Cuidado del cuero y la gamuza',
        imagen: '/images/experiencia/guia-cuidado.webp',
        alt: 'Botas de cuero café',
        href: `${SITIO}/blog/domina-la-limpieza-de-gamuza`,
    },
    {
        id: 'estilo',
        titulo: 'Guías de estilo masculino',
        imagen: '/images/experiencia/guia-estilo.webp',
        alt: 'Hombre con blazer, suéter y botas',
        href: `${SITIO}/blog`,
    },
    {
        id: 'combinar',
        titulo: 'Cómo combinar zapatos y accesorios',
        imagen: '/images/experiencia/guia-combinar.webp',
        alt: 'Mocasines vinotinto en la calle',
        href: `${SITIO}/blog/mocasines-para-hombre-cuando-usarlos-y-como-combinarlos`,
    },
];

export const NOVEDADES = [
    { id: 'zapatos', nombre: 'Zapatos', imagen: '/images/zapatos.jpg', href: '/categoria/zapatos-cuero-hombre' },
    { id: 'ropa', nombre: 'Ropa', imagen: '/images/ropa.jpg', href: '/categoria/ropa-hombre-colombia' },
    { id: 'accesorios', nombre: 'Accesorios', imagen: '/images/accesorios.jpg', href: '/categoria/accesorios-hombre' },
];

export const CORREO_CONTACTO = 'info@winstonandharrystore.com';
export const POLITICA_PRIVACIDAD = '/politica-privacidad-proteccion-datos';
export const TEXTO_DATOS =
    'Autorizo el tratamiento de mis datos personales teniendo en cuenta la Política de Tratamiento de Datos de Winston & Harry.';

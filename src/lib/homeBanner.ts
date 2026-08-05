import { PUBLIC_WP_URL, wcFetch } from './woocommerce';

export interface HomeBannerData {
    hero: {
        image_desktop:  string;
        image_mobile:   string;
        eyebrow:        string;
        title:          string;
        subtitle:       string;
        cta_label:      string;
        cta_href:       string;
        // Colores opcionales
        eyebrow_color?:  string;
        title_color?:    string;
        subtitle_color?: string;
        cta_color?:      string;
    };
    left: {
        image:     string;
        title:     string;
        subtitle:  string;
        cta_label: string;
        cta_href:  string;
    };
    right: {
        image:     string;
        title:     string;
        subtitle:  string;
        cta_label: string;
        cta_href:  string;
    };
}

// Fallback: contenido de demo con imágenes reales del proyecto.
// Se muestra mientras no esté configurado el CPT en WordPress.
const FALLBACK: HomeBannerData = {
    hero: {
        image_desktop:  '/images/banner-look-completo-desk.jpg',
        image_mobile:   '/images/banner-look-completo-mob.jpg',
        eyebrow:        '25% OFF',
        title:          'En tu look completo',
        subtitle:       'Elige un jean, una camisa o polo y un cinturón o reata. Agrega las tres piezas al carrito y recibe automáticamente 25% OFF.',
        cta_label:      'Ver la colección',
        cta_href:       '/categoria/ropa-hombre-colombia',
        eyebrow_color:  'rgba(255,255,255,0.9)',
        title_color:    '#ffffff',
        subtitle_color: 'rgba(255,255,255,0.88)',
        cta_color:      '#ffffff',
    },
    left: {
        image:     '/images/zapatos.jpg',
        title:     'Zapatos de cuero',
        subtitle:  'Oxford, Derby, Chelsea boots y más',
        cta_label: 'Ver zapatos',
        cta_href:  '/categoria/zapatos-cuero-hombre',
    },
    right: {
        image:     '/images/accesorios.jpg',
        title:     'Accesorios',
        subtitle:  'Cinturones, billeteras y maletas',
        cta_label: 'Ver accesorios',
        cta_href:  '/categoria/accesorios-hombre',
    },
};

function parsePost(post: any): HomeBannerData {
    const m = post.meta || {};
    return {
        hero: {
            image_desktop:  m.hero_image_desktop || FALLBACK.hero.image_desktop,
            image_mobile:   m.hero_image_mobile  || m.hero_image_desktop || FALLBACK.hero.image_mobile,
            eyebrow:        m.hero_eyebrow       || FALLBACK.hero.eyebrow,
            title:          m.hero_title         || FALLBACK.hero.title,
            subtitle:       m.hero_subtitle      || FALLBACK.hero.subtitle,
            cta_label:      m.hero_cta_label     || FALLBACK.hero.cta_label,
            cta_href:       m.hero_cta_href      || FALLBACK.hero.cta_href,
            eyebrow_color:  m.hero_eyebrow_color  || FALLBACK.hero.eyebrow_color,
            title_color:    m.hero_title_color    || FALLBACK.hero.title_color,
            subtitle_color: m.hero_subtitle_color || FALLBACK.hero.subtitle_color,
            cta_color:      m.hero_cta_color      || FALLBACK.hero.cta_color,
        },
        left: {
            image:     m.left_image     || FALLBACK.left.image,
            title:     m.left_title     || FALLBACK.left.title,
            subtitle:  m.left_subtitle  || FALLBACK.left.subtitle,
            cta_label: m.left_cta_label || FALLBACK.left.cta_label,
            cta_href:  m.left_cta_href  || FALLBACK.left.cta_href,
        },
        right: {
            image:     m.right_image     || FALLBACK.right.image,
            title:     m.right_title     || FALLBACK.right.title,
            subtitle:  m.right_subtitle  || FALLBACK.right.subtitle,
            cta_label: m.right_cta_label || FALLBACK.right.cta_label,
            cta_href:  m.right_cta_href  || FALLBACK.right.cta_href,
        },
    };
}

export async function getHomeBanner(): Promise<HomeBannerData> {
    try {
        // Intento 1: wcFetch (autenticado)
        const data = await wcFetch('wp/v2/home_banner?per_page=1&_fields=meta');
        if (data && Array.isArray(data) && data.length > 0) {
            console.log('[HomeBanner] ✅ Datos cargados desde WP (autenticado)');
            return parsePost(data[0]);
        }
    } catch (e) {
        console.warn('[HomeBanner] wcFetch falló, intentando público:', e);
    }

    try {
        // Intento 2: fetch público
        const res = await fetch(
            `${PUBLIC_WP_URL}/wp-json/wp/v2/home_banner?per_page=1&_fields=meta`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data) && data.length > 0) {
                console.log('[HomeBanner] ✅ Datos cargados desde WP (público)');
                return parsePost(data[0]);
            }
        }
    } catch (e) {
        console.warn('[HomeBanner] API pública falló, usando fallback:', e);
    }

    console.log('[HomeBanner] ⚠️ Usando fallback hardcodeado');
    return FALLBACK;
}

// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import partytown from '@astrojs/partytown';
import { loadEnv } from 'vite';

// Cargamos variables del .env (sin hardcoding)
const { WC_CONSUMER_KEY, WC_CONSUMER_SECRET, WC_URL } = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');

import fs from "node:fs";
import path from "node:path";
import { EXCLUDED_SLUGS } from "./src/lib/menuCategories.ts";

/** Función para obtener todas las URLs de productos dinámicamente */
async function getDynamicProductPages() {
  if (!WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) return [];

  const cachePath = path.join(process.cwd(), '.astro-sitemap-cache.json');
  if (process.env.NODE_ENV !== 'production' && fs.existsSync(cachePath)) {
      try {
          return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      } catch (e) {}
  }

  const baseUrl = (WC_URL || "https://tienda.winstonandharrystore.com").replace(/\/$/, "");
  let allUrls = [];
  let page = 1;

  try {
    while (true) {
      const res = await fetch(`${baseUrl}/wp-json/wc/v3/products?page=${page}&per_page=100&consumer_key=${WC_CONSUMER_KEY}&consumer_secret=${WC_CONSUMER_SECRET}&status=publish&_fields=slug`);
      const products = await res.json();

      if (!Array.isArray(products) || products.length === 0) break;

      products.forEach(p => {
        if (p && p.slug && typeof p.slug === 'string') {
          const cleanSlug = p.slug.trim();
          if (cleanSlug && !cleanSlug.includes('undefined') && !cleanSlug.includes('null') && !cleanSlug.includes('[object')) {
            // Se asegura de construir las URLs usando siempre el dominio maestro www
            allUrls.push(`https://www.winstonandharrystore.com/productos/${cleanSlug}`);
          }
        }
      });
      page++;
    }
  } catch (e) {
    console.warn("[Sitemap] Error cargando productos:", e.message);
  }
  
  if (process.env.NODE_ENV !== 'production') {
      fs.writeFileSync(cachePath, JSON.stringify(allUrls), 'utf-8');
  }
  return allUrls;
}

const productPages = await getDynamicProductPages();

const categoryPages = []; // Ya no se mapean estáticamente

const allSitemapPages = [...productPages, 'https://www.winstonandharrystore.com/sale'];

// Set para evitar duplicados en el sitemap durante el proceso de generación
const seenUrls = new Set();

export default defineConfig({
  // Dominio maestro estricto para evitar canibalización y alinear los canonicals y sitemaps
  site: 'https://www.winstonandharrystore.com',
  integrations: [
    react(),
    sitemap({
      customPages: allSitemapPages,
      serialize(item) {
        if (!item || !item.url || typeof item.url !== 'string') return undefined;
        if (item.url.includes('undefined') || item.url.includes('null') || item.url.includes('[object')) return undefined;
        if (item.url.includes('?')) return undefined;

        // Transformación y consolidación de dominio
        if (item.url.includes('tienda.winstonandharrystore.com')) {
          item.url = item.url.replace('tienda.winstonandharrystore.com', 'www.winstonandharrystore.com');
        }

        // Si por alguna razón Astro intenta generar URLs sin www, las forzamos
        if (item.url.startsWith('https://winstonandharrystore.com')) {
          item.url = item.url.replace('https://winstonandharrystore.com', 'https://www.winstonandharrystore.com');
        }

        if (item.url.includes('/product/')) {
          item.url = item.url.replace('/product/', '/productos/');
        }
        if (item.url.includes('/product-category/')) {
          item.url = item.url.replace('/product-category/', '/categoria/');
        }

        if (item.url !== 'https://www.winstonandharrystore.com/' && item.url !== 'https://www.winstonandharrystore.com' && item.url.endsWith('/')) {
          item.url = item.url.slice(0, -1);
        }

        if (seenUrls.has(item.url)) return undefined;
        seenUrls.add(item.url);

        return item;
      },
      filter: (page) => {
        if (!page || typeof page !== 'string') return false;
        if (page.includes('undefined') || page.includes('null') || page.includes('[object')) return false;
        if (page.includes('?')) return false;

        const excludedPatterns = ['/wp-json/', '/wp-admin/', '/wp-content/', '/xmlrpc', '/api/', '/carrito', '/checkout', '/cart/', '/mi-cuenta', '/my-account/', '/login', '/lost-password', '/edit-account', '/recuperar-password', '/lista-de-deseos', '/404', '/gracias', '/menu-test', '/buscar', '/tienda', 'uncategorized', 'sin-categorizar', '/productos/test', ...EXCLUDED_SLUGS.map(slug => `/${slug}`)];

        if (excludedPatterns.some(pattern => page.includes(pattern))) {
          return false;
        }

        return true;
      }
    }),
    partytown({
      config: {
        forward: [] // Meta Pixel corre en hilo principal (is:inline), no necesita forwarding
      }
    })
  ],
  redirects: {
    '/review-unicentro': 'https://g.page/r/CUpXPMxMDYUWEBM/review',
    '/review-palatino': 'https://g.page/r/CVqAdcaz3jkUEBM/review',
    '/review-santabarbara': 'https://g.page/r/CfogiOsEUdgVEBM/review',
    '/review-retiro': 'https://g.page/r/CSKXwQ5l5zSpEBM/review',
    '/categoria/reatascinturones': '/categoria/cinturones-reatas-cuero-hombre',
    '/categoria/billeteras': '/categoria/billeteras-cuero-hombre',
    '/categoria/limpieza': '/categoria/limpieza-cuidado-zapatos',
    '/productos/limpiador-en-seco': '/categoria/accesorios-hombre',
    '/productos/sueter-tejido-escalera-negro': '/categoria/sueteres-chalecos-hombre',
    '/regalos-dia-del-padre': '/',
    
    // Redirects Categorías Legacy (eliminadas)
    '/categoria/menos-de-200000': '/sale',
    '/categoria/menos-de-350000': '/sale',
    '/categoria/menos-de-499000': '/sale',
    '/categoria/mas-de-500000': '/sale',
    '/categoria/outlet-zapatos-ropa': '/sale',
    '/categoria/sin-categorizar': '/',
    '/categoria/ideas-regalo-hombre': '/',
    '/categoria/bono-regalo-hombre': '/',
    '/categoria/zapatos-maletas-cuero-hombre': '/categoria/zapatos-cuero-hombre',
    '/categoria/chaquetas-cuero-hombre': '/categoria/ropa-hombre-colombia',
    '/categoria/cinturones-cuero-hombre': '/categoria/cinturones',
    
    // Redirects Productos 404 Muertos a sus categorías superiores
    '/productos/collar-perro-trenzado': '/categoria/collares-cuero-perro',
    '/productos/collar-perro-cuero': '/categoria/collares-cuero-perro',
    '/productos/reata-670': '/categoria/cinturones',
    '/productos/reata-7586-04': '/categoria/cinturones',
    '/productos/portabilletes-rfid': '/categoria/billeteras-cuero-hombre',
    '/productos/wallet': '/categoria/billeteras-cuero-hombre',
    '/productos/clip-card-holder': '/categoria/billeteras-cuero-hombre',
    '/productos/crema-humectante': '/categoria/limpieza-cuidado-zapatos',
    '/productos/bono-de-regalo': '/',
    '/productos/bono-de-regalo-2': '/',
    '/productos/producto': '/',
    '/productos/kit-animales': '/categoria/collares-cuero-perro',
    '/productos/kit-animales-2': '/categoria/collares-cuero-perro',
    '/productos/huntingdon': '/categoria/zapatos-cuero-hombre',
    '/productos/dorset': '/categoria/zapatos-cuero-hombre',
    '/productos/maicao': '/categoria/zapatos-cuero-hombre',
    '/productos/cumbria-ii': '/categoria/zapatos-cuero-hombre',
    '/productos/manchester': '/categoria/zapatos-cuero-hombre',
    '/productos/wiltshire': '/categoria/zapatos-cuero-hombre',
    '/productos/rutland': '/categoria/zapatos-cuero-hombre',
    '/productos/amberley': '/categoria/zapatos-cuero-hombre',
    '/productos/morral-viscount': '/categoria/maletas-morrales-cuero',
    '/productos/berkshire': '/categoria/zapatos-cuero-hombre',
    '/productos/ramsey': '/categoria/zapatos-cuero-hombre',
    '/productos/exester': '/categoria/zapatos-cuero-hombre',
    '/productos/cesar': '/categoria/zapatos-cuero-hombre',
  },
  output: 'static',
  adapter: vercel({
    maxDuration: 300
  }),
  security: {
    checkOrigin: false
  },
  trailingSlash: 'never',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover'
  },
  image: {
    domains: ["winstonandharrystore.com", "staging.winstonandharrystore.com", "tienda.winstonandharrystore.com"],
    remotePatterns: [{ protocol: 'https', hostname: 'tienda.winstonandharrystore.com' }]
  },
  vite: {
    server: {
      watch: {
        ignored: ['**/public/data/build-cache/**', '**/public/data/catalog/**']
      }
    }
  }
});
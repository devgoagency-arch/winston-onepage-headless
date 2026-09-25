/**
 * generate-catalog.mjs
 * 
 * Regenera los JSON estáticos del catálogo en /public/data/catalog/
 * Ejecutar: node scripts/generate-catalog.mjs
 * 
 * Esto soluciona el problema de productos nuevos que no aparecen en:
 * - El buscador (usa tienda-all.json como índice)
 * - La pestaña MALETAS del home (usaba slug incorrecto maletas-morrales-cuero)
 * - Los favoritos de ROPA sin badge "NUEVO"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = path.join(__dirname, '..', 'public', 'data', 'catalog');

// Credenciales WooCommerce (desde .env)
const WC_KEY = process.env.WC_CONSUMER_KEY || 'ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f';
const WC_SECRET = process.env.WC_CONSUMER_SECRET || 'cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc';
const WC_BASE = 'tienda.winstonandharrystore.com';
const AUTH = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');

// Categorías a generar (slug del archivo → ID en WooCommerce)
// IMPORTANTE: el slug debe coincidir exactamente con lo que usan los componentes
const CATEGORIES_TO_GENERATE = [
  { slug: 'tienda',                         id: null,  name: 'Tienda completa' },
  { slug: 'zapatos-cuero-hombre',           id: '63',  name: 'Zapatos' },
  { slug: 'ropa-hombre-colombia',           id: '249', name: 'Ropa' },
  { slug: 'maletas-morrales-cuero-hombre',  id: '190', name: 'Maletas y Morrales' },
  { slug: 'sueteres-chalecos-hombre',       id: '955', name: 'Suéteres y Chalecos' },
  { slug: 'accesorios-hombre',              id: '220', name: 'Accesorios' },
];

/**
 * Hace una petición HTTPS a la API de WooCommerce
 */
function wcGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: WC_BASE,
      path: `/wp-json/wc/v3${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Accept': 'application/json',
        'User-Agent': 'WinstonHarry-CatalogGenerator/1.0',
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Descarga TODOS los productos de una categoría paginando de 100 en 100.
 * Si categoryId es null, descarga el catálogo completo.
 */
async function fetchAllProductsForCategory(categoryId, categoryName) {
  const products = [];
  let page = 1;
  const PER_PAGE = 100;

  console.log(`  📥 Descargando ${categoryName}...`);

  while (true) {
    const params = new URLSearchParams({
      per_page: PER_PAGE.toString(),
      page: page.toString(),
      status: 'publish',
      stock_status: 'instock',
      orderby: 'date',
      order: 'desc',
    });

    if (categoryId) {
      params.set('category', categoryId);
    }

    try {
      const data = await wcGet(`/products?${params.toString()}`);

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      // Mapear solo los campos necesarios (mismo formato que usa el frontend)
      const mapped = data.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        prices: {
          price: p.price || p.regular_price || '0',
          regular_price: p.regular_price || p.price || '0',
          sale_price: p.sale_price || '',
          currency_code: 'COP',
          currency_symbol: '$',
          currency_minor_unit: 0,
          currency_prefix: '$',
          price_range: null,
        },
        images: (p.images || []).slice(0, 3).map(img => ({
          id: img.id,
          src: img.src,
          alt: img.alt || p.name,
          name: img.name || '',
        })),
        categories: (p.categories || []).map(c => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
        attributes: (p.attributes || []).map(a => ({
          id: a.id,
          name: a.name,
          slug: a.slug || a.name,
          terms: (a.options || a.terms || []).map((opt, idx) => 
            typeof opt === 'string' 
              ? { id: idx, name: opt, slug: opt.toLowerCase().replace(/\s+/g, '-') }
              : { id: opt.id || idx, name: opt.name, slug: opt.slug }
          ),
        })),
        variations: [], // Las variaciones completas son muy pesadas; se cargan on-demand
        stock_status: p.stock_status,
        on_sale: p.on_sale || false,
        featured: p.featured || false,
        date_created: p.date_created || null,
        // variation_images_map se reconstruye on-demand en el frontend
      }));

      products.push(...mapped);
      console.log(`    Página ${page}: ${data.length} productos (total: ${products.length})`);

      if (data.length < PER_PAGE) break;
      page++;

      // Pequeña pausa para no saturar el servidor
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`    ❌ Error en página ${page}:`, err.message);
      break;
    }
  }

  return products;
}

/**
 * Ordena los productos poniendo primero los más nuevos (≤60 días)
 */
function sortNewProductsFirst(products) {
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

  const newProds = products.filter(p => p.date_created && new Date(p.date_created) >= sixtyDaysAgo);
  const oldProds = products.filter(p => !p.date_created || new Date(p.date_created) < sixtyDaysAgo);

  newProds.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());

  return [...newProds, ...oldProds];
}

async function main() {
  console.log('🚀 Generando catálogos estáticos de WooCommerce...\n');

  if (!fs.existsSync(CATALOG_DIR)) {
    fs.mkdirSync(CATALOG_DIR, { recursive: true });
  }

  for (const cat of CATEGORIES_TO_GENERATE) {
    try {
      const products = await fetchAllProductsForCategory(cat.id, cat.name);

      // ⚠️ PROTECCIÓN: Si no se obtuvieron productos (fallo de red o WC vacío),
      // NO sobreescribir el archivo existente para no borrar datos válidos.
      if (products.length === 0) {
        const outputPath = path.join(CATALOG_DIR, `${cat.slug}-all.json`);
        if (fs.existsSync(outputPath)) {
          const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
          if (Array.isArray(existing) && existing.length > 0) {
            console.log(`  ⚠️  ${cat.slug}-all.json → Sin datos de WooCommerce. Se conserva el archivo existente (${existing.length} productos)\n`);
            continue;
          }
        }
        console.log(`  ⚠️  ${cat.slug}-all.json → Sin datos obtenidos. Archivo vacío generado.\n`);
      }

      const sorted = sortNewProductsFirst(products);

      const outputPath = path.join(CATALOG_DIR, `${cat.slug}-all.json`);
      fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 0), 'utf-8');

      // Contar cuántos son "nuevos" (≤60 días)
      const now = new Date();
      const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
      const newCount = sorted.filter(p => p.date_created && new Date(p.date_created) >= sixtyDaysAgo).length;

      console.log(`  ✅ ${cat.slug}-all.json → ${sorted.length} productos (${newCount} nuevos en los últimos 60 días)\n`);

    } catch (err) {
      console.error(`  ❌ Error generando ${cat.slug}:`, err.message, '\n');
    }
  }

  console.log('✨ Catálogos generados correctamente.');
  console.log('   Los nuevos productos ahora aparecerán:');
  console.log('   - En el buscador (usa tienda-all.json)');
  console.log('   - En el home (Zapatos, Ropa, Maletas)');
  console.log('   - Con etiqueta NUEVO si tienen ≤ 60 días desde su creación');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

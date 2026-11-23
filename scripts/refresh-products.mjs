/**
 * Renueva los JSON de productos de public/data/products con los datos vigentes de WooCommerce.
 *
 * Por qué: las tarjetas (al pasar el cursor) y la página de producto leen estos archivos, que antes solo se
 * descargaban si no existían. Con fotos, colores o precios cambiados quedaban datos viejos.
 *
 * Usa la API pública del propio sitio (/api/products), que devuelve el mismo formato que getProductBySlug.
 * Si un producto falla se conserva su archivo anterior. Nunca rompe el build (siempre termina con código 0).
 *
 * Uso: node scripts/refresh-products.mjs   (también corre en "prebuild")
 * Variables opcionales: PRODUCTS_API_BASE (por defecto https://www.winstonandharrystore.com), REFRESH_CONCURRENCY.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'products');
const BASE = (process.env.PRODUCTS_API_BASE || 'https://www.winstonandharrystore.com').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.REFRESH_CONCURRENCY || 3);
const TIME_BUDGET_MS = 8 * 60 * 1000;
const started = Date.now();

async function getJson(url, timeoutMs = 60000) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function listSlugs() {
    const slugs = new Set();
    for (let page = 1; page <= 8; page++) {
        const data = await getJson(`${BASE}/api/products?per_page=100&page=${page}&orderby=popularity`, 120000);
        if (!Array.isArray(data) || data.length === 0) break;
        data.forEach(p => p?.slug && slugs.add(p.slug));
        if (data.length < 100) break;
    }
    return [...slugs];
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const slugs = await listSlugs();
    if (slugs.length < 50) {
        console.warn(`[refresh-products] Solo ${slugs.length} productos en el listado: se conservan los archivos actuales.`);
        return;
    }
    let ok = 0, failed = 0, changed = 0, skipped = 0, i = 0;
    const worker = async () => {
        while (i < slugs.length) {
            const slug = slugs[i++];
            if (Date.now() - started > TIME_BUDGET_MS) { skipped++; continue; }
            try {
                const data = await getJson(`${BASE}/api/products?slug=${encodeURIComponent(slug)}`);
                const product = Array.isArray(data) ? data[0] : data;
                if (!product || product.slug !== slug || !product.prices?.price) throw new Error('respuesta inválida');
                const file = path.join(OUT_DIR, `${slug}.json`);
                const next = JSON.stringify(product, null, 2);
                const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
                if (prev !== next) { fs.writeFileSync(file, next, 'utf-8'); changed++; }
                ok++;
            } catch (e) {
                failed++;
                console.warn(`[refresh-products] ${slug}: ${e.message} (se conserva el archivo anterior)`);
            }
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`[refresh-products] ${ok} revisados, ${changed} actualizados, ${failed} con error, ${skipped} sin tiempo.`);
}

main().catch(e => console.warn(`[refresh-products] No se pudo renovar (se conservan los archivos actuales): ${e.message}`));

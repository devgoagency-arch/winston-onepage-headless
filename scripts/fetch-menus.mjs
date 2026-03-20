/**
 * Script de pre-build: descarga los menús de WordPress y los guarda como JSON estático.
 * Esto garantiza que los menús siempre estén disponibles sin depender de WordPress en runtime.
 *
 * Uso: node scripts/fetch-menus.mjs
 * Se ejecuta automáticamente antes del build via "prebuild" en package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Cargar .env manualmente (sin dotenv para evitar dependencias extra)
function loadEnv() {
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
    }
}

loadEnv();

// ── Config ──────────────────────────────────────────────────────────────────
let WP_URL = (process.env.WC_URL || process.env.WP_URL || 'https://tienda.winstonandharrystore.com').replace(/\/$/, '');

// Corrección: asegurar dominio correcto
if (WP_URL.includes('winstonandharrystore.com') && !WP_URL.includes('tienda.')) {
    WP_URL = WP_URL.replace('winstonandharrystore.com', 'tienda.winstonandharrystore.com');
}

const WP_USER = process.env.WP_APP_USER || '';
const WP_PASS = process.env.WP_APP_PASS || '';
const CK = (process.env.WC_CONSUMER_KEY || process.env.WP_CONSUMER_KEY || '').trim();
const CS = (process.env.WC_CONSUMER_SECRET || process.env.WP_CONSUMER_SECRET || '').trim();

// Directorio de salida donde se guardarán los JSONs
const OUTPUT_DIR = path.join(ROOT, 'public', 'data', 'menus');

// Lista de menús a descargar (slug de WordPress → nombre de archivo)
const MENUS_TO_FETCH = [
    { slug: 'menu-principal', file: 'menu-principal.json' },
    { slug: 'atencion-al-cliente', file: 'atencion-al-cliente.json' },
    { slug: 'nosotros', file: 'nosotros.json' },
    { slug: 'legal', file: 'legal.json' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function getAuthHeader() {
    if (WP_USER && WP_PASS) {
        return `Basic ${Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64')}`;
    }
    return null;
}

async function fetchMenu(slug) {
    const url = `${WP_URL}/wp-json/wh/v1/menu/${slug}`;
    console.log(`  Fetching: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const reqOptions = {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        };
        const auth = getAuthHeader();
        if (auth) {
            reqOptions.headers['Authorization'] = auth;
        }

        const res = await fetch(url, reqOptions);
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`  ⚠ HTTP ${res.status} para "${slug}" — se omitirá.`);
            return null;
        }

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            console.warn(`  ⚠ Menú "${slug}" vino vacío — se omitirá.`);
            return null;
        }

        return data;
    } catch (e) {
        clearTimeout(timeout);
        console.error(`  ✗ Error al obtener "${slug}": ${e.message}`);
        return null;
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🍔 Winston & Harry — Descargando menús de WordPress...\n');
    console.log(`   WP_URL: ${WP_URL}`);
    console.log(`   Auth: ${WP_USER ? 'Application Password' : (CK ? 'Consumer Key' : '⚠ SIN AUTH')}\n`);

    // Crear directorio de salida si no existe
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`✅ Directorio creado: ${OUTPUT_DIR}\n`);
    }

    let successCount = 0;
    let skipCount = 0;

    for (const { slug, file } of MENUS_TO_FETCH) {
        console.log(`📥 Menú: "${slug}"`);
        const data = await fetchMenu(slug);

        if (data) {
            const outputPath = path.join(OUTPUT_DIR, file);
            // Guardar con metadata de timestamp para debugging
            const payload = {
                _fetched_at: new Date().toISOString(),
                _slug: slug,
                items: data
            };
            fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
            console.log(`  ✅ Guardado: ${file} (${data.length} items)\n`);
            successCount++;
        } else {
            // Si ya existe un archivo previo, lo mantenemos como fallback
            const outputPath = path.join(OUTPUT_DIR, file);
            if (fs.existsSync(outputPath)) {
                console.log(`  ⚠ Manteniendo versión anterior de ${file}\n`);
            } else {
                // Crear archivo vacío para evitar errores de importación
                fs.writeFileSync(outputPath, JSON.stringify({ _fetched_at: null, _slug: slug, items: [] }, null, 2), 'utf-8');
                console.log(`  ⚠ Creado ${file} vacío (sin datos de WP)\n`);
            }
            skipCount++;
        }
    }

    console.log(`\n📊 Resultado: ${successCount} éxitos, ${skipCount} omitidos de ${MENUS_TO_FETCH.length} menús.`);
    
    if (successCount === 0) {
        console.warn('\n⚠  ADVERTENCIA: No se pudo descargar ningún menú. El sitio usará los archivos existentes o mostrará menús vacíos.\n');
        // No lanzamos error para no bloquear el build
    } else {
        console.log('\n✅ Menús listos para el build.\n');
    }
}

main().catch(e => {
    console.error('Error fatal en fetch-menus:', e);
    process.exit(0); // Exit 0 para no bloquear el build si WP no está disponible
});

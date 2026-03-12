
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const CK = env.WC_CONSUMER_KEY;
const CS = env.WC_CONSUMER_SECRET;
const URL = env.WP_URL || 'https://tienda.winstonandharrystore.com';

async function test() {
    const id = 63; // Zapatos usually
    // Probamos ambos métodos
    const configs = [
        { name: 'Basic Auth', url: `${URL}/wp-json/wc/v3/products/categories/63`, headers: { 'Authorization': `Basic ${Buffer.from(`${CK}:${CS}`).toString('base64')}` } },
        { name: 'Query Params', url: `${URL}/wp-json/wc/v3/products/categories/63?consumer_key=${CK}&consumer_secret=${CS}`, headers: {} }
    ];

    for (const config of configs) {
        console.log(`\n--- Testing ${config.name} ---`);
        try {
            const res = await fetch(config.url, { headers: config.headers });
            const data = await res.json();
            if (res.ok) {
                console.log("SUCCESS!");
                console.log("Name:", data.name);
                console.log("Meta Data Keys:", data.meta_data?.map(m => m.key));
                const d = data.meta_data?.find(m => m.key === 'banner_categoria_desktop');
                const m = data.meta_data?.find(m => m.key === 'imagen_categoria_movil');
                console.log("Desktop:", d?.value);
                console.log("Mobile:", m?.value);
            } else {
                console.log("FAILED:", data.message || data.code);
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

test();

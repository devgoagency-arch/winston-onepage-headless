
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        env[key] = value;
    }
});

const CK = env.WC_CONSUMER_KEY;
const CS = env.WC_CONSUMER_SECRET;
const WP_URL = env.WP_URL || 'https://tienda.winstonandharrystore.com';

const auth = Buffer.from(`${CK}:${CS}`).toString('base64');

async function test() {
    console.log("Listing some categories with Basic Auth...");
    const url = `${WP_URL}/wp-json/wc/v3/products/categories?per_page=20`;
    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        const data = await res.json();
        
        if (Array.isArray(data)) {
            data.forEach(cat => {
                console.log(`- ${cat.name} (${cat.slug}) | Meta: ${cat.meta_data?.length || 0}`);
                const d = cat.meta_data?.find(m => m.key === 'banner_categoria_desktop');
                const m = cat.meta_data?.find(m => m.key === 'imagen_categoria_movil');
                if (d || m) {
                    console.log(`  Desktop: ${d?.value}`);
                    console.log(`  Mobile: ${m?.value}`);
                }
            });
        } else {
            console.log("Response:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

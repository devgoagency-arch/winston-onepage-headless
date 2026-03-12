
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
    const slug = 'ropa';
    console.log(`Checking Category ${slug} via WC API (ID lookup first)...`);
    
    // 1. Get ID via public API
    const wpRes = await fetch(`${URL}/wp-json/wp/v2/product_cat?slug=${slug}`);
    const wpData = await wpRes.json();
    if (!wpData[0]) return console.log("Not found in WP");
    const id = wpData[0].id;
    console.log("ID:", id);

    // 2. Get full meta via WC API
    const url = `${URL}/wp-json/wc/v3/products/categories/${id}?consumer_key=${CK}&consumer_secret=${CS}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        console.log("ACF object in WC API?", !!data.acf);
        console.log("Meta Data count:", data.meta_data?.length);
        
        const desktop = data.meta_data?.find(m => m.key === 'banner_categoria_desktop');
        const mobile = data.meta_data?.find(m => m.key === 'imagen_categoria_movil');
        
        console.log("Desktop Meta:", desktop);
        console.log("Mobile Meta:", mobile);
        
        if (!desktop && !mobile) {
            console.log("All Meta Keys:", data.meta_data?.map(m => m.key));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

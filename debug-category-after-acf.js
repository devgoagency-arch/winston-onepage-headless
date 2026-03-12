
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
    console.log(`Checking Category ${slug} via WC API...`);
    // Usamos el endpoint de categorías con el slug
    const url = `${URL}/wp-json/wc/v3/products/categories?slug=${slug}&consumer_key=${CK}&consumer_secret=${CS}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
            const cat = data[0];
            console.log("Name:", cat.name);
            console.log("ID:", cat.id);
            console.log("ACF field exists in root?", !!cat.acf);
            if (cat.acf) console.log("ACF data:", JSON.stringify(cat.acf, null, 2));
            console.log("Meta Data keys:", cat.meta_data?.map(m => m.key));
            
            const desktop = cat.meta_data?.find(m => m.key === 'banner_categoria_desktop');
            const mobile = cat.meta_data?.find(m => m.key === 'imagen_categoria_movil');
            
            console.log("Desktop Meta:", desktop);
            console.log("Mobile Meta:", mobile);
        } else {
            console.log("Category not found or Error:", data);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

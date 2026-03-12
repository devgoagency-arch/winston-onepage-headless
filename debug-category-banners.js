
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
    // Probamos con slugs comunes
    const slugs = ['ropa', 'zapatos', 'accesorios'];
    
    for (const slug of slugs) {
        console.log(`\n--- Checking Category: ${slug} ---`);
        const url = `${WP_URL}/wp-json/wc/v3/products/categories?slug=${slug}`;
        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            });
            const data = await res.json();
            
            if (Array.isArray(data) && data.length > 0) {
                const cat = data[0];
                console.log(`Name: ${cat.name} (ID: ${cat.id})`);
                console.log("Standard Image:", cat.image?.src);
                
                if (cat.meta_data) {
                    const desktop = cat.meta_data.find(m => m.key === 'banner_categoria_desktop');
                    const mobile = cat.meta_data.find(m => m.key === 'imagen_categoria_movil');
                    
                    console.log("Meta Field 'banner_categoria_desktop':", desktop?.value);
                    console.log("Meta Field 'imagen_categoria_movil':", mobile?.value);
                    
                    // Si no son esos, veamos otros que puedan ser
                    console.log("All Metas:");
                    cat.meta_data.forEach(m => {
                        if (typeof m.value === 'string' && (m.value.includes('http') || m.value.includes('.jpg') || m.value.includes('.png'))) {
                            console.log(`  [POTENTIAL IMAGE] ${m.key}: ${m.value}`);
                        } else {
                            // console.log(`  ${m.key}: ${typeof m.value}`);
                        }
                    });
                }
            } else {
                console.log(`No data for ${slug}. Response:`, JSON.stringify(data).substring(0, 100));
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

test();

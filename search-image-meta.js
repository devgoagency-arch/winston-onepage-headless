
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
    console.log("Searching for the mobile URL in all categories...");
    const url = `${URL}/wp-json/wc/v3/products/categories?per_page=100&consumer_key=${CK}&consumer_secret=${CS}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (Array.isArray(data)) {
            data.forEach(cat => {
                const standard = cat.image?.src;
                const metas = cat.meta_data || [];
                
                let foundInMeta = false;
                metas.forEach(m => {
                    if (JSON.stringify(m.value).includes('ropa-m.jpg')) {
                        console.log(`FOUND IN ${cat.name} (${cat.slug}) | Field: ${m.key}`);
                        console.log("Value:", m.value);
                        foundInMeta = true;
                    }
                });
                
                if (standard && standard.includes('ropa-m.jpg')) {
                    console.log(`FOUND IN ${cat.name} (${cat.slug}) | Standard Image`);
                }
            });
        } else {
            console.log("Error or empty array:", data.message || data);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

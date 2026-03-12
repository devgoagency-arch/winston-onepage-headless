
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
    const id = 249; // Ropa
    console.log(`Checking Category ${id} via WC API with Query Params...`);
    const url = `${URL}/wp-json/wc/v3/products/categories/${id}?consumer_key=${CK}&consumer_secret=${CS}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (res.ok) {
            console.log("Name:", data.name);
            console.log("Main Image:", data.image?.src);
            console.log("All Metas:");
            data.meta_data.forEach(m => {
                console.log(`- ${m.key}: ${JSON.stringify(m.value)}`);
            });
        } else {
            console.log("WC API Error:", data.message || data.code);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

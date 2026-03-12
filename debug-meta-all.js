
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

const auth = Buffer.from(`${CK}:${CS}`).toString('base64');

async function test() {
    const id = 249; // Ropa
    console.log(`Checking Category ${id} via WC API with Basic Auth...`);
    const url = `${URL}/wp-json/wc/v3/products/categories/${id}`;
    
    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        const data = await res.json();
        
        if (res.ok) {
            console.log("Name:", data.name);
            console.log("Main Image Object:", JSON.stringify(data.image, null, 2));
            console.log("Metas (all):");
            data.meta_data.forEach(m => {
                console.log(`- KEY: [${m.key}] | VALUE: ${JSON.stringify(m.value)}`);
            });
        } else {
            console.log("Error:", data.message || data.code);
            console.log("Trying with Query Params just in case...");
            const qUrl = `${url}?consumer_key=${CK}&consumer_secret=${CS}`;
            const qRes = await fetch(qUrl);
            const qData = await qRes.json();
            if (qRes.ok) {
                console.log("Name (QP):", qData.name);
                console.log("Metas (QP):");
                qData.meta_data.forEach(m => console.log(`- ${m.key}: ${JSON.stringify(m.value)}`));
            } else {
                console.log("QP also failed:", qData.message);
            }
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();


import fs from 'fs';
import path from 'path';

// Manual env parser
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const CK = env.WC_CONSUMER_KEY;
const CS = env.WC_CONSUMER_SECRET;
const WP_URL = env.WP_URL || 'https://tienda.winstonandharrystore.com';

async function test() {
    console.log("Fetching category 'zapatos'...");
    const url = `${WP_URL}/wp-json/wc/v3/products/categories?slug=zapatos&consumer_key=${CK}&consumer_secret=${CS}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.length > 0) {
            const cat = data[0];
            console.log("Category ID:", cat.id);
            console.log("Name:", cat.name);
            console.log("Meta Data length:", cat.meta_data?.length);
            
            const desktop = cat.meta_data?.find(m => m.key === 'banner_categoria_desktop');
            const mobile = cat.meta_data?.find(m => m.key === 'imagen_categoria_movil');
            
            console.log("Desktop Banner Meta:", JSON.stringify(desktop, null, 2));
            console.log("Mobile Image Meta:", JSON.stringify(mobile, null, 2));
            
            if (!desktop && !mobile) {
                console.log("All meta keys:", cat.meta_data?.map(m => m.key));
            }
        } else {
            console.log("No category found.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

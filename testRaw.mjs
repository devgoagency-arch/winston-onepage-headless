import fetch from 'node-fetch';

async function test() {
    try {
        const storeRes = await fetch('https://tienda.winstonandharrystore.com/wp-json/wc/store/v1/products/83178');
        const data = await storeRes.json();
        console.log("Variations length:", data.variations ? data.variations.length : 0);
        if (data.variations && data.variations.length > 0) {
            console.log(JSON.stringify(data.variations[0], null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
test();

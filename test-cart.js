const https = require('https');
async function run() {
    const fetch = (await import('node-fetch')).default;
    const url = "https://tienda.winstonandharrystore.com/wp-json/wc/store/v1/cart";
    const res1 = await fetch(url);
    const cartToken = res1.headers.get("Cart-Token");
    const nonce = res1.headers.get("Nonce");
    
    console.log("Token:", cartToken, "Nonce:", nonce);

    const headers = {
        "Cart-Token": cartToken,
        "Nonce": nonce,
        "Content-Type": "application/json"
    };

    // Add Item 1 (Naranja M - 62548)
    await fetch(url + "/add-item", {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: 62545, variation_id: 62548, quantity: 1 })
    });

    // Add Item 2 (Rojo L - 62551)
    const res2 = await fetch(url + "/add-item", {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: 62545, variation_id: 62551, quantity: 1 })
    });
    
    const finalCart = await res2.json();
    console.log("TOTALS:", JSON.stringify(finalCart.totals, null, 2));
    console.log("FEES:", JSON.stringify(finalCart.fees, null, 2));
    console.log("ITEMS:", JSON.stringify(finalCart.items.map(i => i.name), null, 2));
}
run().catch(console.error);

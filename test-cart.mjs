import fetch from 'node-fetch';

async function run() {
    const url = "https://tienda.winstonandharrystore.com/wp-json/wc/store/v1/cart";
    
    const initHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    const res1 = await fetch(url, { headers: initHeaders });
    const cartToken = res1.headers.get("Cart-Token");
    const nonce = res1.headers.get("Nonce");
    
    console.log("Token:", cartToken, "Nonce:", nonce);

    const headers = {
        "Cart-Token": cartToken,
        "Nonce": nonce,
        "Content-Type": "application/json",
        "User-Agent": initHeaders["User-Agent"]
    };

    console.log("Adding item 1...");
    await fetch(url + "/add-item", {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: 62545, variation_id: 62548, quantity: 1 })
    });

    console.log("Adding item 2...");
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

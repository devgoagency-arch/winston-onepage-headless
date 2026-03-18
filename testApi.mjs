async function test() {
    try {
        const res = await fetch('http://localhost:4321/api/products?per_page=5');
        const data = await res.json();
        for (const p of data) {
            if (p.variations && p.variations.length > 0) {
                console.log("=== PRODUCT:", p.name, "===");
                console.log(JSON.stringify(p.variations[0], null, 2));
                break;
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
test();

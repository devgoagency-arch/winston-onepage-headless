
async function test() {
    const ids = [249, 63]; // Ropa, Zapatos
    for (const id of ids) {
        console.log(`\n--- WP/V2 Category ID: ${id} ---`);
        const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/product_cat/${id}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            console.log("Name:", data.name);
            console.log("Full ACF:", JSON.stringify(data.acf, null, 2));
            console.log("Full Data Keys:", Object.keys(data));
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}
test();

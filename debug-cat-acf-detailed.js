
async function test() {
    const id = 249; // Ropa
    const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/product_cat/${id}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log("Keys in root:", Object.keys(data));
        console.log("Keys in ACF:", data.acf ? Object.keys(data.acf) : "No ACF");
        if (data.acf) {
            for (const key in data.acf) {
                console.log(`ACF ${key}:`, data.acf[key]);
            }
        }
    } catch (e) {
        console.error(e.message);
    }
}
test();


async function test() {
    const id = 249;
    const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/product_cat/${id}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log("Category:", data.name);
        // En wp/v2 la imagen suele ser un ID en 'image' o similar
        // Pero WooCommerce la maneja diferente.
        console.log("Keys:", Object.keys(data));
        console.log("ACF:", JSON.stringify(data.acf, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();


async function test() {
    const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/product_cat?per_page=50`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        data.forEach(cat => {
            console.log(`Cat: ${cat.name} (${cat.slug})`);
            console.log("ACF:", JSON.stringify(cat.acf, null, 2));
        });
    } catch (e) {
        console.error(e.message);
    }
}
test();

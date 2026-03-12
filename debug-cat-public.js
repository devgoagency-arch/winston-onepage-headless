
async function test() {
    const slugs = ['ropa', 'zapatos'];
    for (const slug of slugs) {
        console.log(`\n--- WP/V2 Category: ${slug} ---`);
        const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/product_cat?slug=${slug}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const cat = data[0];
                console.log("ID:", cat.id);
                console.log("Name:", cat.name);
                console.log("ACF Banners:", JSON.stringify(cat.acf, null, 2));
                // A veces están bajo 'meta'
                console.log("Meta:", JSON.stringify(cat.meta, null, 2));
            } else {
                console.log("No found in wp/v2");
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}
test();

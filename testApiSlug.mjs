async function test() {
    try {
        const res = await fetch('http://localhost:4321/api/products?slug=camisa-button-under-linea-gruesa');
        const data = await res.json();
        console.log("=== PRODUCT:", data.name, "===");
        console.log("variation_images_map keys:", data.variation_images_map ? Object.keys(data.variation_images_map) : "UNDEFINED");
        console.log("Variations length:", data.variations ? data.variations.length : 0);
        if (data.variations && data.variations.length > 0) {
            console.log(JSON.stringify(data.variations[0], null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
test();

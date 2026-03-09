
const { getProductsByCategory } = require('./src/lib/woocommerce');

async function test() {
    try {
        console.log("Fetching category 63...");
        const products = await getProductsByCategory('63', 10);
        console.log(`Found ${products?.length || 0} products.`);
        if (products && products.length > 0) {
            console.log("First product:", products[0].name, "Price:", products[0].prices.price);
        }
    } catch (e) {
        console.error("Error in test:", e);
    }
}

test();

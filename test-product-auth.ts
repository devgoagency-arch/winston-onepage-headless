
import { getProductById } from './src/lib/woocommerce';

async function testProduct() {
    console.log("Testing getProductById(60330)...");
    const product = await getProductById(60330);
    console.log("Product result:", product ? "Found: " + product.name : "Not found");
}

testProduct();

import { getProductBySlug } from './src/lib/woocommerce.ts';

async function test() {
    const p = await getProductBySlug('cumbria');
    if (!p) {
        console.log("Product not found");
        return;
    }
    const varsData = p.variations_data || [];
    console.log(JSON.stringify(varsData.map((v: any) => ({
        id: v.id,
        attributes: v.attributes.map((a: any) => a.value || a.option),
        stock_status: v.stock_status,
        manage_stock: v.manage_stock,
        stock_quantity: v.stock_quantity
    })), null, 2));
}
test();

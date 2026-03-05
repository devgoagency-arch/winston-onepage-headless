const CK = "ck_28661c4aff0fc02b97a607862895fc40a187e867";
const CS = "cs_deb208f164b96724a90b64bf0f762a713251b7a2";
const URL = "https://winstonandharrystore.com/wp-json/wc/v3";

async function checkVariations() {
    try {
        const auth = Buffer.from(`${CK}:${CS}`).toString('base64');
        // Let's find one product that is on sale
        const pRes = await fetch(`${URL}/products?per_page=1&on_sale=true`, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        const products = await pRes.json();
        if (products.length === 0) return;

        const p = products[0];
        console.log('Product:', p.name, 'Type:', p.type);

        if (p.type === 'variable') {
            const vRes = await fetch(`${URL}/products/${p.id}/variations`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            const variations = await vRes.json();
            if (variations.length > 0) {
                const v = variations[0];
                console.log('Variation Price:', v.price);
                console.log('Variation Regular Price:', v.regular_price);
                console.log('Variation Sale Price:', v.sale_price);
                console.log('Variation On Sale:', v.on_sale);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkVariations();

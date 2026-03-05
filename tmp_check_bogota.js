const CK = "ck_28661c4aff0fc02b97a607862895fc40a187e867";
const CS = "cs_deb208f164b96724a90b64bf0f762a713251b7a2";
const URL = "https://winstonandharrystore.com/wp-json/wc/v3";

async function checkBogota() {
    try {
        const auth = Buffer.from(`${CK}:${CS}`).toString('base64');
        const response = await fetch(`${URL}/products?slug=bogota`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        const data = await response.json();
        if (data.length > 0) {
            const p = data[0];
            console.log('Product Name:', p.name);
            console.log('on_sale:', p.on_sale);
            console.log('price:', p.price);
            console.log('regular_price:', p.regular_price);
            console.log('sale_price:', p.sale_price);

            if (p.type === 'variable') {
                const vRes = await fetch(`${URL}/products/${p.id}/variations`, {
                    headers: { 'Authorization': `Basic ${auth}` }
                });
                const variations = await vRes.json();
                console.log('Variations count:', variations.length);
                if (variations.length > 0) {
                    const v = variations[0];
                    console.log('Variation 0 Regular:', v.regular_price, 'Price:', v.price, 'On Sale:', v.on_sale);
                }
            }
        } else {
            console.log('Bogota not found');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkBogota();

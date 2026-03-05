const CK = "ck_28661c4aff0fc02b97a607862895fc40a187e867";
const CS = "cs_deb208f164b96724a90b64bf0f762a713251b7a2";
const URL = "https://winstonandharrystore.com/wp-json/wc/v3";

async function checkOnSale() {
    try {
        const auth = Buffer.from(`${CK}:${CS}`).toString('base64');
        const response = await fetch(`${URL}/products?per_page=10&on_sale=true`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        if (!response.ok) {
            console.log('Response Status:', response.status);
            const text = await response.text();
            console.log('Response Body:', text.substring(0, 100));
            return;
        }

        const data = await response.json();

        console.log('Products on sale count:', data.length);
        if (data.length > 0) {
            data.slice(0, 3).forEach(p => {
                console.log('---');
                console.log('Product Name:', p.name);
                console.log('on_sale:', p.on_sale);
                console.log('price:', p.price);
                console.log('regular_price:', p.regular_price);
                console.log('sale_price:', p.sale_price);
            });
        } else {
            console.log('No products on sale found.');
        }
    } catch (error) {
        console.error('Error fetching from WC:', error.message);
    }
}

checkOnSale();


const WC_CONSUMER_KEY = 'ck_28661c4aff0fc02b97a607862895fc40a187e867';
const WC_CONSUMER_SECRET = 'cs_c89b8ca601e38933b9c7195e7834571de430f81d';

async function checkProduct() {
    const auth = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');
    // Fetch a few products to see attributes
    const response = await fetch('https://winstonandharry.com/wp-json/wc/v3/products?per_page=5', {
        headers: {
            'Authorization': `Basic ${auth}`
        }
    });

    const products = await response.json();
    for (const p of products) {
        console.log(`Product: ${p.name}`);
        console.log('Attributes:', JSON.stringify(p.attributes, null, 2));
    }
}

checkProduct();


const WC_CONSUMER_KEY = 'ck_28661c4aff0fc02b97a607862895fc40a187e867';
const WC_CONSUMER_SECRET = 'cs_c89b8ca601e38933b9c7195e7834571de430f81d';

async function checkAttributes() {
    const auth = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');
    const response = await fetch('https://winstonandharry.com/wp-json/wc/v3/products/attributes', {
        headers: {
            'Authorization': `Basic ${auth}`
        }
    });

    if (!response.ok) {
        console.error('Error:', response.status, await response.text());
        return;
    }

    const attributes = await response.json();
    console.log('Attributes:', JSON.stringify(attributes, null, 2));

    for (const attr of attributes) {
        const termsResponse = await fetch(`https://winstonandharry.com/wp-json/wc/v3/products/attributes/${attr.id}/terms`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        if (termsResponse.ok) {
            const terms = await termsResponse.json();
            console.log(`Terms for ${attr.name} (ID: ${attr.id}):`, terms.length);
        }
    }
}

checkAttributes();

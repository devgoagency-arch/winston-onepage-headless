import fetch from 'node-fetch';

async function test() {
    const url = 'https://tienda.winstonandharrystore.com/wp-json/wc/v3/products?slug=salvador';
    const ck = 'ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f';
    const cs = 'cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc';
    const auth = Buffer.from(`${ck}:${cs}`).toString('base64');

    const res = await fetch(url, {
        headers: {
            'Authorization': `Basic ${auth}`
        }
    });
    const data = await res.json();
    const p = data[0];
    console.log('Main Product price:', p.price);
    
    if (p.variations.length > 0) {
        const vUrl = `https://tienda.winstonandharrystore.com/wp-json/wc/v3/products/${p.id}/variations`;
        const vRes = await fetch(vUrl, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        const vData = await vRes.json();
        console.log('First variation:', JSON.stringify(vData[0], (key, value) => {
            if (key === 'description' || key === 'short_description') return undefined;
            return value;
        }, 2));
    }
}

test();

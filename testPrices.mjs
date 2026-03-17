import fetch from 'node-fetch';

async function test() {
    const url = 'https://tienda.winstonandharrystore.com/wp-json/wc/v3/products?slug=salvador';
    const ck = 'ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f';
    const cs = 'cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc';
    const auth = Buffer.from(`${ck}:${cs}`).toString('base64');

    const res = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    const p = (await res.json())[0];
    
    console.log('Main Price:', p.price);
    console.log('Main Reg Price:', p.regular_price);

    const vUrl = `https://tienda.winstonandharrystore.com/wp-json/wc/v3/products/${p.id}/variations`;
    const vRes = await fetch(vUrl, { headers: { 'Authorization': `Basic ${auth}` } });
    const vData = await vRes.json();
    
    vData.slice(0, 3).forEach((v, i) => {
        console.log(`Var ${i} (${v.id}): price=${v.price}, regular=${v.regular_price}, sale=${v.sale_price}`);
    });
}

test();

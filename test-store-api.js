import fs from 'fs';

async function test() {
    try {
        const res = await fetch('https://tienda.winstonandharrystore.com/wp-json/wc/store/v1/products?slug=cumbria');
        const data = await res.json();
        console.log(JSON.stringify(data[0].variations, null, 2));
    } catch(e) {
        console.error(e);
    }
}
test();

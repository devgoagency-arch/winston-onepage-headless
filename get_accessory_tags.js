
const axios = require('axios');
const ck = 'ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f';
const cs = 'cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc';
const url = `https://tienda.winstonandharrystore.com/wp-json/wc/v3/products?category=126&per_page=50&consumer_key=${ck}&consumer_secret=${cs}`;

async function main() {
    try {
        const response = await axios.get(url);
        const products = response.data;
        const tags = new Map();
        products.forEach(p => {
            p.tags.forEach(t => {
                tags.set(t.slug, t.name);
            });
        });
        console.log('--- TAGS FOR ACCESSORIES ---');
        console.log(Array.from(tags.entries()));
        console.log('--- END ---');
    } catch (e) {
        console.error(e.message);
    }
}
main();

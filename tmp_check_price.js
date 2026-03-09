
const CK = "ck_28661c4aff0fc02b97a607862895fc40a187e867";
const CS = "cs_deb208f164b96724a90b64bf0f762a713251b7a2";
const BASE_URL = "https://tienda.winstonandharrystore.com/wp-json/wc/v3";
const auth = Buffer.from(`${CK}:${CS}`).toString('base64');

async function test() {
    console.log("Searching for Morral Viscount...");
    const res = await fetch(`${BASE_URL}/products?search=Morral Viscount`, {
        headers: { 'Authorization': `Basic ${auth}` }
    });
    const products = await res.json();
    if (products.length === 0) {
        console.log("No products found.");
        return;
    }
    const p = products[0];
    console.log(`ID: ${p.id}`);
    console.log(`Name: ${p.name}`);
    console.log(`Price: "${p.price}"`);
    console.log(`Regular Price: "${p.regular_price}"`);
    console.log(`Sale Price: "${p.sale_price}"`);
    console.log(`Type: ${p.type}`);
    console.log(`Tax Status: ${p.tax_status}`);
}

test();

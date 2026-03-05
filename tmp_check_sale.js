import axios from 'axios';

const CK = 'ck_32448caac13824ee768e7af56994770337c7676e';
const CS = 'cs_99e9007e997d95a94709492f25492d50e82847f9';
const URL = 'https://winstonandharry.com/wp-json/wc/v3';

async function checkOnSale() {
    try {
        const response = await axios.get(`${URL}/products`, {
            params: {
                category: '63',
                per_page: 5,
                on_sale: true
            },
            auth: {
                username: CK,
                password: CS
            }
        });

        console.log('Products on sale count:', response.data.length);
        if (response.data.length > 0) {
            const p = response.data[0];
            console.log('Product Name:', p.name);
            console.log('on_sale:', p.on_sale);
            console.log('price:', p.price);
            console.log('regular_price:', p.regular_price);
            console.log('sale_price:', p.sale_price);
        } else {
            console.log('No products on sale found in category 63.');
        }
    } catch (error) {
        console.error('Error fetching from WC:', error.message);
    }
}

checkOnSale();

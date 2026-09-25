import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const CK = process.env.WC_CONSUMER_KEY;
const CS = process.env.WC_CONSUMER_SECRET;

async function run() {
    const orderId = 87070;
    const res = await fetch(`https://tienda.winstonandharrystore.com/wp-json/wc/v3/orders/${orderId}?consumer_key=${CK}&consumer_secret=${CS}`);
    const order = await res.json();
    
    console.log(`Order #${orderId} Status: ${order.status}`);
    console.log(`Payment method: ${order.payment_method}`);
    console.log(`Transaction ID: ${order.transaction_id || 'None'}`);
    
    const metaCapi = order.meta_data.find(m => m.key === '_meta_capi_sent');
    console.log(`\n_meta_capi_sent: ${metaCapi ? metaCapi.value : 'NOT SET (lock never ran)'}`);
    
    console.log('\n--- Full meta_data keys ---');
    order.meta_data.forEach(m => {
        if (m.key.includes('meta_capi') || m.key.includes('mercado') || m.key.includes('mp_') || m.key === '_transaction_id') {
            console.log(`  ${m.key}: ${m.value}`);
        }
    });
}

run();

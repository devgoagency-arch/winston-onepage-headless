import { wcFetch } from '../../lib/woocommerce';

export const prerender = false;

export async function GET({ request }) {
    const WC_URL = "https://tienda.winstonandharrystore.com";
    let logs = [];
    const log = (msg, data = null) => { logs.push({ msg, data }); };

    try {
        const cartRes = await fetch(WC_URL + '/wp-json/wc/store/v1/cart');
        const cartToken = cartRes.headers.get('Cart-Token');
        const nonce = cartRes.headers.get('Nonce');
        log('Cart Token & Nonce', { cartToken, nonce });

        const addRes = await fetch(WC_URL + '/wp-json/wc/store/v1/cart/add-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cart-Token': cartToken, 'Nonce': nonce },
            body: JSON.stringify({ id: 62547, quantity: 2 })
        });
        log('Add Item', { status: addRes.status, data: await addRes.json().catch(()=>null) });

        const tempCouponCode = '2x1test_' + Date.now();
        const createdCoupon = await wcFetch('coupons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: tempCouponCode, amount: "245000", discount_type: 'fixed_cart' })
        });
        log('Create Coupon', createdCoupon);

        const applyRes = await fetch(WC_URL + '/wp-json/wc/store/v1/cart/apply-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cart-Token': cartToken, 'Nonce': nonce },
            body: JSON.stringify({ code: tempCouponCode })
        });
        log('Apply Coupon', { status: applyRes.status, data: await applyRes.json().catch(()=>null) });

        const checkRes = await fetch(WC_URL + '/wp-json/wc/store/v1/cart', {
            headers: { 'Cart-Token': cartToken, 'Nonce': nonce }
        });
        const checkData = await checkRes.json();
        log('Final Cart Totals', checkData.totals);

        return new Response(JSON.stringify({ logs }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message, logs }, null, 2), { status: 500 });
    }
}

import { wcFetch } from './src/lib/woocommerce.ts';

async function test() {
    const WC_URL = 'https://tienda.winstonandharrystore.com';
    const CK = 'ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f';
    const CS = 'cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc';
    const auth = Buffer.from(CK+':'+CS).toString('base64');
    
    // 1. cart
    const cartRes = await fetch(WC_URL + '/wp-json/wc/store/v1/cart');
    const cartToken = cartRes.headers.get('Cart-Token');
    const nonce = cartRes.headers.get('Nonce');
    
    // 2. add item (orange, red sweaters)
    await fetch(WC_URL + '/wp-json/wc/store/v1/cart/add-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cart-Token': cartToken, 'Nonce': nonce },
        body: JSON.stringify({ id: 62556, quantity: 1 })
    });
    await fetch(WC_URL + '/wp-json/wc/store/v1/cart/add-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cart-Token': cartToken, 'Nonce': nonce },
        body: JSON.stringify({ id: 62547, quantity: 1 })
    });
    
    // 3. create coupon
    const tempCouponCode = '2x1esc_' + Date.now();
    const createdCoupon = await fetch(WC_URL + '/wp-json/wc/v3/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + auth },
        body: JSON.stringify({
            code: tempCouponCode,
            amount: '245000',
            discount_type: 'fixed_cart',
            usage_limit: 1
        })
    }).then(r => r.json());
    console.log('Coupon created:', createdCoupon.id);
    
    // 4. apply
    const applyRes = await fetch(WC_URL + '/wp-json/wc/store/v1/cart/apply-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cart-Token': cartToken, 'Nonce': nonce },
        body: JSON.stringify({ code: tempCouponCode })
    });
    console.log('Apply status:', applyRes.status);
    const applyData = await applyRes.json();
    console.log('Apply coupons in cart:', applyData.coupons?.map(c=>c.code));
    
    // 5. checkout
    const checkoutPayload = {
        payment_method: 'woo-mercado-pago-basic',
        billing_address: { first_name: 'Test', last_name: 'Test', email: 'test@test.com' }
    };
    const checkoutRes = await fetch(WC_URL + '/wp-json/wc/store/v1/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cart-Token': cartToken, 'Nonce': nonce },
        body: JSON.stringify(checkoutPayload)
    });
    const checkData = await checkoutRes.json();
    console.log('Checkout Order ID:', checkData.order_id);
    
    // 6. Check order in WC
    const orderData = await fetch(WC_URL + '/wp-json/wc/v3/orders/' + checkData.order_id, {
        headers: { 'Authorization': 'Basic ' + auth }
    }).then(r => r.json());
    
    console.log('Order total:', orderData.total, 'Discount:', orderData.discount_total);
    console.log('Order coupons:', orderData.coupon_lines?.map(c=>c.code));
}

test();

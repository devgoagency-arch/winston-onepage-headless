export const prerender = false;
import type { APIRoute } from 'astro';
import { wcFetch, PUBLIC_WP_URL } from '../../lib/woocommerce';

// ── Addi Direct API Helpers ─────────────────────────────────────────────────
async function getAddiToken(): Promise<string> {
    const res = await fetch('https://auth.addi.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: import.meta.env.ADDI_CLIENT_ID,
            client_secret: import.meta.env.ADDI_CLIENT_SECRET,
            audience: 'https://api.addi.com'
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`[Addi Auth] Error obteniendo token: ${err}`);
    }
    const data = await res.json();
    console.log('[Addi Auth] Token obtenido correctamente');
    return data.access_token;
}

async function createAddiApplication(token: string, body: any, orderData: any): Promise<string> {
    const allySlug = import.meta.env.ADDI_ALLY_SLUG || 'winstonharry-ecommerce';
    const orderId = orderData.id;
    const total    = parseFloat(orderData.total         || '0').toFixed(1);
    const shipping = parseFloat(orderData.shipping_total || '0').toFixed(1);
    const tax      = parseFloat(orderData.total_tax      || '0').toFixed(1);
    const orderKey = orderData.order_key || '';

    // Mapear ítems de la orden de WooCommerce
    const items = (orderData.line_items || []).map((item: any) => ({
        sku:       item.sku || String(item.product_id || 'PROD'),
        name:      item.name || 'Producto',
        quantity:  item.quantity || 1,
        unitPrice: parseFloat(item.price || '0').toFixed(1),
        tax:       '0',
        pictureUrl: item.image?.src || '',
        category:  'simple'
    }));

    const addiPayload = {
        orderId:           orderId,
        totalAmount:       total,
        shippingAmount:    shipping,
        totalTaxesAmount:  tax,
        currency:          'COP',
        ecommercePlatform: 'WOOCOMMERCE',
        items: items.length > 0 ? items : [{
            sku:       `ORDEN-${orderId}`,
            name:      'Compra Winston & Harry',
            quantity:  1,
            unitPrice: total,
            tax:       '0',
            pictureUrl: '',
            category:  'simple'
        }],
        client: {
            firstName:            body.first_name || 'Cliente',
            lastName:             body.last_name || 'Winston',
            idType:               body.document_type || 'CC',
            idNumber:             body.document_id   || '',
            email:                body.email,
            cellphone:            (body.phone || '').replace(/\D/g, '').slice(-10),
            cellphoneCountryCode: '+57',
            address: {
                lineOne: body.address_1 || 'No proporcionada',
                city:    body.city      || 'Bogotá',
                country: 'CO'
            }
        },
        shippingAddress: {
            lineOne: body.ship_to_different_address
                ? (body.shipping_address_1 || body.address_1 || 'No proporcionada')
                : (body.address_1 || 'No proporcionada'),
            city: body.ship_to_different_address
                ? (body.shipping_city || body.city || 'Bogotá')
                : (body.city || 'Bogotá'),
            country: 'CO'
        },
        allyUrlRedirection: {
            logoUrl:        'https://www.winstonandharrystore.com/wp-content/uploads/logo-winston.png',
            callbackUrl:    `${PUBLIC_WP_URL}/?wc-api=wc_addi_gateway`,
            redirectionUrl: `${PUBLIC_WP_URL}/checkout/order-received/${orderId}/?key=${orderKey}`
        }
    };

    console.log('[Addi] Enviando payload a /v1/online-applications:', JSON.stringify(addiPayload));

    // redirect: 'manual' para capturar el header Location sin seguirlo
    const res = await fetch('https://api.addi.com/v1/online-applications', {
        method: 'POST',
        redirect: 'manual',
        headers: {
            'Content-Type': 'application/json',
            'Accept':        'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(addiPayload)
    });

    const locationUrl = res.headers.get('location') || res.headers.get('Location') || '';
    console.log('[Addi] Status:', res.status, '| Location:', locationUrl);

    if (locationUrl) return locationUrl;

    // Si no hay Location, leer body para diagnóstico
    const resBody = await res.text();
    console.error('[Addi] Sin Location header. Body:', resBody);
    throw new Error(`[Addi] Sin URL de redirección. Status: ${res.status}`);
}
// ────────────────────────────────────────────────────────────────────────────

// Función para mapear a códigos de departamento válidos en WooCommerce (Colombia)
const getValidStateCode = (stateName: string): string => {
  if (!stateName) return "BOG";
  const s = stateName.toLowerCase();
  if (s.includes("amazona")) return "AMA";
  if (s.includes("antioqui") || s.includes("antioq")) return "ANT";
  if (s.includes("arauca")) return "ARA";
  if (s.includes("atlán") || s.includes("atlan")) return "ATL";
  if (s.includes("bolívar") || s.includes("bolivar")) return "BOL";
  if (s.includes("boyac")) return "BOY";
  if (s.includes("caldas")) return "CAL";
  if (s.includes("caquetá") || s.includes("caqueta")) return "CAQ";
  if (s.includes("casanare")) return "CAS";
  if (s.includes("cauca")) return "CAU";
  if (s.includes("cesar")) return "CES";
  if (s.includes("chocó") || s.includes("choco")) return "CHO";
  if (s.includes("córdoba") || s.includes("cordoba")) return "COR";
  if (s.includes("cundinam")) return "CUN";
  if (s.includes("guainía") || s.includes("guainia")) return "GUA";
  if (s.includes("guaviare")) return "GUV";
  if (s.includes("huila")) return "HUI";
  if (s.includes("la guajira") || s.includes("guajira")) return "LAG";
  if (s.includes("magdalena")) return "MAG";
  if (s.includes("meta")) return "MET";
  if (s.includes("nariño") || s.includes("narino")) return "NAR";
  if (s.includes("norte de santander") || s.includes("n. santander")) return "NSA";
  if (s.includes("putumayo")) return "PUT";
  if (s.includes("quindío") || s.includes("quindio")) return "QUI";
  if (s.includes("risaralda")) return "RIS";
  if (s.includes("san andrés") || s.includes("san andres")) return "SAP";
  if (s.includes("santander")) return "SAN"; // debe ir DESPUÉS de norte de santander
  if (s.includes("sucre")) return "SUC";
  if (s.includes("tolima")) return "TOL";
  if (s.includes("valle")) return "VAC";
  if (s.includes("vaupés") || s.includes("vaupes")) return "VAU";
  if (s.includes("vichada")) return "VID";
  if (s.includes("bog") || s.includes("d.c") || s.includes("capital")) return "BOG";
  return "BOG"; // fallback seguro
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
    try {
        const body = await request.json();
        const WC_URL = PUBLIC_WP_URL;

        // Capturar cabeceras reales del navegador para evitar bloqueos antifraude de Addi
        const clientUserAgent = request.headers.get('user-agent') || 'Mozilla/5.0';
        const clientLanguage = request.headers.get('accept-language') || 'es-ES,es;q=0.9';
        const clientIp = request.headers.get('x-forwarded-for') || clientAddress || '127.0.0.1';

        const forwardHeaders = {
            'User-Agent': clientUserAgent,
            'Accept-Language': clientLanguage,
            'X-Forwarded-For': clientIp,
            'X-Real-IP': clientIp,
        };

        console.log('[API Store Checkout] Iniciando sesión con IP:', clientIp);

        // 1. Obtener Cart-Token y Nonce inicial
        const cartRes = await fetch(`${WC_URL}/wp-json/wc/store/v1/cart`, { headers: forwardHeaders });
        let cartToken = cartRes.headers.get('Cart-Token') || '';
        const nonce = cartRes.headers.get('Nonce') || '';

        // 2. Limpiar el carrito antes de agregar ítems (evita contaminación entre sesiones)
        const clearRes = await fetch(`${WC_URL}/wp-json/wc/store/v1/cart/items`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Cart-Token': cartToken,
                'Nonce': nonce,
                ...forwardHeaders
            }
        });
        cartToken = clearRes.headers.get('Cart-Token') || cartToken;

        // 3. Agregar los ítems al carrito (Store API usa el body tal cual lo manda CheckoutPage)
        for (const item of body.items) {
            const itemId = item.variation_id ? item.variation_id : item.product_id;
            const addItemRes = await fetch(`${WC_URL}/wp-json/wc/store/v1/cart/add-item`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cart-Token': cartToken,
                    'Nonce': nonce,
                    ...forwardHeaders
                },
                body: JSON.stringify({
                    id: itemId,
                    quantity: item.quantity
                })
            });
            cartToken = addItemRes.headers.get('Cart-Token') || cartToken;

            if (!addItemRes.ok) {
                const addErr = await addItemRes.json().catch(() => ({}));
                console.error(`[API Store Checkout] Error al agregar el ítem ${itemId} al carrito:`, addErr);
                return new Response(
                    JSON.stringify({ error: addErr.message || 'Error al agregar producto al carrito' }),
                    { status: 400 }
                );
            }
        }

        // NOTA: El descuento 2x1 de Suéter Tejido Escalera ya NO se calcula aquí.
        // Se maneja de forma nativa en WooCommerce vía el hook
        // `woocommerce_cart_calculate_fees` (fee automático server-side, no requiere
        // cupón). Mantener ambos mecanismos activos causaba riesgo de doble descuento.
        try {
            // Aplicar cupón manual al carrito si el cliente ingresó uno
            if (body.coupon_code) {
                const applyCouponRes = await fetch(`${WC_URL}/wp-json/wc/store/v1/cart/apply-coupon`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Nonce': nonce, 'Cart-Token': cartToken, ...forwardHeaders },
                    body: JSON.stringify({ code: body.coupon_code })
                });
                cartToken = applyCouponRes.headers.get('Cart-Token') || cartToken;
                if (!applyCouponRes.ok) {
                    const couponErr = await applyCouponRes.json().catch(() => ({}));
                    console.warn('[API Store Checkout] No se pudo aplicar el cupón manual:', couponErr.message || 'Error desconocido');
                } else {
                    console.log('[API Store Checkout] Cupón manual aplicado en WooCommerce:', body.coupon_code);
                }
            }
        } catch (err: any) {
            console.error('[API Store Checkout] Error aplicando cupón manual:', err.message);
        }
        // ─────────────────────────────────────────────────────────────────────────────


        const paymentMethodId = body.payment_method === 'addi' ? 'addi' : 'woo-mercado-pago-basic';
        
        const validState = getValidStateCode(body.state);
        const validShippingState = body.ship_to_different_address ? getValidStateCode(body.shipping_state) : validState;
        
        const validPostcode = body.postcode || '110010';
        const validShippingPostcode = body.ship_to_different_address ? (body.shipping_postcode || '110010') : validPostcode;

        const checkoutPayload = {
            billing_address: {
                first_name: body.first_name || 'Cliente',
                last_name: body.last_name || 'Winston',
                address_1: body.address_1 || 'No proporcionada',
                address_2: body.address_2 || '',
                city: body.city || 'Bogotá',
                state: validState,
                postcode: validPostcode,
                country: 'CO',
                email: body.email,
                phone: body.phone || '0000000000',
                "addi/cedula-id": body.document_id
            },
            shipping_address: {
                first_name: body.ship_to_different_address ? (body.shipping_first_name || 'Cliente') : (body.first_name || 'Cliente'),
                last_name: body.ship_to_different_address ? (body.shipping_last_name || 'Winston') : (body.last_name || 'Winston'),
                address_1: body.ship_to_different_address ? (body.shipping_address_1 || 'No proporcionada') : (body.address_1 || 'No proporcionada'),
                address_2: body.ship_to_different_address ? (body.shipping_address_2 || '') : (body.address_2 || ''),
                city: body.ship_to_different_address ? (body.shipping_city || 'Bogotá') : (body.city || 'Bogotá'),
                state: validShippingState,
                postcode: validShippingPostcode,
                country: 'CO',
                phone: body.phone || '0000000000',
                "addi/cedula-id": body.document_id
            },
            customer_note: body.order_notes || '',
            payment_method: paymentMethodId,
            meta_data: [
                { key: 'billing_cedula', value: body.document_id },
                { key: 'addi_cedula', value: body.document_id },
                { key: '_billing_cedula', value: body.document_id },
                { key: 'billing_document_type', value: body.document_type },
                { key: 'addi_document_type', value: body.document_type },
                { key: 'billing_city_dane', value: body.city },
                { key: '_billing_city_dane', value: body.city },
            ]
        };

        console.log('[API Store Checkout] Procesando pago con:', paymentMethodId);
        console.log('[DEBUG CITY]', JSON.stringify({
          city: body.city,
          meta_data: checkoutPayload.meta_data
        }));

        // 4. Ejecutar el Checkout en Store API
        const checkoutRes = await fetch(`${WC_URL}/wp-json/wc/store/v1/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cart-Token': cartToken,
                'Nonce': nonce,
                ...forwardHeaders
            },
            body: JSON.stringify(checkoutPayload)
        });

        const checkoutData = await checkoutRes.json();
        console.log('[API Store Checkout] Respuesta Store API:', checkoutData.order_id ? `Orden ${checkoutData.order_id} OK` : 'ERROR', checkoutData);

        if (!checkoutRes.ok || !checkoutData.order_id) {
            return new Response(
                JSON.stringify({ 
                    error: 'Error en la pasarela de pago', 
                    details: checkoutData.message || 'El checkout de WooCommerce falló.' 
                }),
                { status: 400 }
            );
        }

        // 5. (Híbrido) Inyectar Meta Datos de Cédula y capturar order_key para el fallback
        // wcFetch retorna el JSON directamente (no un Response), o null si hay error
        let orderKey = '';
        let fullOrderData = null;
        const orderUpdateData = await wcFetch(`/orders/${checkoutData.order_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meta_data: [
                    { key: '_billing_cedula', value: body.document_id || '' },
                    { key: 'billing_cedula', value: body.document_id || '' },
                    { key: '_billing_dni', value: body.document_id || '' }
                ]
            })
        });
        if (orderUpdateData && orderUpdateData.order_key) {
            orderKey = orderUpdateData.order_key;
            fullOrderData = orderUpdateData;
            console.log('[API Store Checkout] order_key capturado:', orderKey);
        } else {
            // Si el PUT no devolvió order_key, hacemos un GET para obtenerlo
            const orderGetData = await wcFetch(`/orders/${checkoutData.order_id}`);
            fullOrderData = orderGetData;
            if (orderGetData && orderGetData.order_key) {
                orderKey = orderGetData.order_key;
                console.log('[API Store Checkout] order_key via GET:', orderKey);
            }
        }

        // 6. Obtener la URL de redirección directa
        console.log('[DEBUG payment_result]', JSON.stringify(checkoutData.payment_result));
        let finalPaymentUrl = '';

        if (body.payment_method === 'addi') {
            // ── Addi: llamamos la API directamente para obtener la URL de pago ──
            try {
                const addiToken = await getAddiToken();
                // Si fullOrderData es null por alguna razón, usamos un objeto base
                const orderDataToUse = fullOrderData || { id: checkoutData.order_id, total: 0, order_key: orderKey };
                const addiRedirectUrl = await createAddiApplication(addiToken, body, orderDataToUse);

                if (addiRedirectUrl) {
                    finalPaymentUrl = addiRedirectUrl;
                    console.log('[Addi] URL de pago generada:', finalPaymentUrl);
                } else {
                    console.error('[Addi] No se recibió URL de redirección de Addi');
                    // Fallback seguro con order_key
                    const keyParam = orderKey ? `&key=${orderKey}` : '';
                    finalPaymentUrl = `${WC_URL}/checkout/order-pay/${checkoutData.order_id}/?pay_for_order=true${keyParam}`;
                }
            } catch (addiErr: any) {
                console.error('[Addi] Error creando preapplication:', addiErr.message);
                // Fallback seguro con order_key
                const keyParam = orderKey ? `&key=${orderKey}` : '';
                finalPaymentUrl = `${WC_URL}/checkout/order-pay/${checkoutData.order_id}/?pay_for_order=true${keyParam}`;
            }
        } else if (checkoutData.payment_result && checkoutData.payment_result.redirect_url) {
            const rawMpUrl = checkoutData.payment_result.redirect_url;
            try {
                const mpUrl = new URL(rawMpUrl);
                // Mercado Pago respeta back_url como query param en su checkout
                mpUrl.searchParams.set('back_url', 'https://www.winstonandharrystore.com/gracias');
                finalPaymentUrl = mpUrl.toString();
            } catch {
                // Si la URL no es parseable, usarla tal cual como fallback
                finalPaymentUrl = rawMpUrl;
            }
        } else {
            const keyParam = orderKey ? `&key=${orderKey}` : '';
            finalPaymentUrl = `${WC_URL}/checkout/order-pay/${checkoutData.order_id}/?pay_for_order=true${keyParam}`;
        }

        return new Response(
            JSON.stringify({
                order_id: checkoutData.order_id,
                order_number: checkoutData.order_id,
                payment_url: finalPaymentUrl,
                status: 'pending',
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    } catch (error: any) {
        console.error('[API Store Checkout] Error crítico:', error.message);
        return new Response(
            JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
            { status: 500 }
        );
    }
};

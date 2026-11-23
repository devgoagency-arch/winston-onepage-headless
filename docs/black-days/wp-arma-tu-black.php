<?php
/**
 * Plugin Name: Winston & Harry — Arma tu Black 2026
 * Description: Descuento automático para WooCommerce y Store API.
 */
defined('ABSPATH') || exit;

function wh_black_days_active($now = null) {
    $zone = new DateTimeZone('America/Bogota');
    $start = new DateTime('2026-11-23 00:00:00', $zone);
    $end = new DateTime('2026-11-30 23:59:59', $zone);
    $now = $now ?: new DateTime('now', $zone);
    return $now->getTimestamp() >= $start->getTimestamp() && $now->getTimestamp() <= $end->getTimestamp();
}

function wh_arma_tu_black_amount($prices) {
    $EXTRA_UNITS_DISCOUNT = 0; // por confirmar con negocio
    rsort($prices, SORT_NUMERIC);
    $n = count($prices);
    $rates = $n === 1 ? array(15) : ($n === 2 ? array(15, 50) : ($n === 3 ? array(15, 15, 50) : array(15, 15, 50, 50)));
    $discount = 0;
    foreach ($prices as $index => $price) {
        $pct = $rates[$index] ?? $EXTRA_UNITS_DISCOUNT;
        $discount += round($price * $pct / 100, 0, PHP_ROUND_HALF_UP);
    }
    return $discount;
}

add_action('woocommerce_cart_calculate_fees', function ($cart) {
    if ((is_admin() && !defined('DOING_AJAX')) || !wh_black_days_active()) return;
    $prices = array();
    foreach ($cart->get_cart() as $item) {
        $product = $item['data'];
        if (!$product) continue;
        // Los tags de una variación pertenecen a su producto padre.
        $parent_id = $product->get_parent_id() ?: $product->get_id();
        $parent = $product->get_parent_id() ? wc_get_product($parent_id) : $product;
        if (!$parent) continue;
        $price = (float) $product->get_price();
        $regular = $product->get_regular_price();
        // Fallback histórico del front para carritos antiguos sin tags.
        $identity = strtolower($parent->get_slug() . ' ' . $parent->get_name());
        if ($product->is_on_sale() || ($regular !== '' && $price < (float) $regular)
            || has_term(937, 'product_tag', $parent_id) || strpos($identity, 'escalera') !== false) continue;
        for ($i = 0; $i < (int) $item['quantity']; $i++) $prices[] = $price;
    }
    $discount = wh_arma_tu_black_amount($prices);
    // WooCommerce reinicia los fees en cada recálculo; no acumular ni usar did_action.
    if ($discount > 0) $cart->add_fee('Arma tu Black', -$discount, false);
}, 20);

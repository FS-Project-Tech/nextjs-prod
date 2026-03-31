<?php
/**
 * Force WooCommerce country = Australia (AU)
 *
 * Add this to your theme's functions.php or a custom plugin.
 * Ensures AU is used for checkout defaults, allowed countries, and orders
 * (including orders created via REST API / headless checkout).
 *
 * @package YourTheme
 */

defined('ABSPATH') || exit;

// =============================================================================
// 1. Default checkout country
// =============================================================================
function set_default_country_au() {
    return 'AU';
}
add_filter('default_checkout_billing_country', 'set_default_country_au');
add_filter('default_checkout_shipping_country', 'set_default_country_au');

// =============================================================================
// 2. Allow only Australia in WooCommerce
// =============================================================================
function allow_only_australia_country($countries) {
    return array(
        'AU' => 'Australia'
    );
}
add_filter('woocommerce_countries_allowed_countries', 'allow_only_australia_country');

// =============================================================================
// 3. Force AU when order is created via traditional checkout
// =============================================================================
function force_order_country_au($order, $data) {
    $order->set_billing_country('AU');
    $order->set_shipping_country('AU');
}
add_action('woocommerce_checkout_create_order', 'force_order_country_au', 20, 2);

// =============================================================================
// 4. Force AU when order is created via REST API (headless checkout)
//    Orders from Next.js /api/checkout use WooCommerce REST API - this hook
//    ensures country is set even if the API payload had empty country.
// =============================================================================
add_action('woocommerce_rest_insert_shop_order', 'force_rest_order_country_au', 10, 2);

function force_rest_order_country_au($order, $request) {
    if (!is_a($order, 'WC_Order')) {
        return;
    }
    $billing_country = $order->get_billing_country();
    $shipping_country = $order->get_shipping_country();
    $needs_save = false;
    if (empty($billing_country) || !preg_match('/^[A-Z]{2}$/', $billing_country)) {
        $order->set_billing_country('AU');
        $needs_save = true;
    }
    if (empty($shipping_country) || !preg_match('/^[A-Z]{2}$/', $shipping_country)) {
        $order->set_shipping_country('AU');
        $needs_save = true;
    }
    if ($needs_save) {
        $order->save();
    }
}

// =============================================================================
// 5. Ensure country displays in admin order edit (format address)
//    WooCommerce formats addresses for display - ensure country is included.
// =============================================================================
add_filter('woocommerce_order_formatted_billing_address', 'ensure_country_in_formatted_address', 10, 2);
add_filter('woocommerce_order_formatted_shipping_address', 'ensure_country_in_formatted_address', 10, 2);

function ensure_country_in_formatted_address($address, $order) {
    if (empty($address['country']) || strlen($address['country']) !== 2) {
        $address['country'] = 'AU';
    }
    return $address;
}

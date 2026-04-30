<?php
/**
 * Plugin Name: Joya Headless Checkout Token (MU)
 * Description: Redeems headless Next.js checkout_token, creates WooCommerce order, redirects to pay (eWAY). Drop into wp-content/mu-plugins/
 * Version: 1.0.0
 *
 * FLOW
 * ----
 * 1. Customer completes Next.js checkout → POST /api/checkout/create-session → redirect to {site}/?checkout_token=TOKEN
 * 2. This plugin (init, priority 1): detects checkout_token, POSTs to Next /api/checkout/get-session with shared secret (consume=true)
 * 3. Builds WC_Order from session payload (no WC cart session)
 * 4. Redirects to $order->get_checkout_payment_url() → order-pay → optional auto-submit (JS below)
 *
 * PRICING INTEGRITY
 * -----------------
 * Next.js may create sessions using a signed quote (see CHECKOUT_QUOTE_SIGNING_SECRET / quote-totals).
 * Session totals are stored in `session.totals` and applied as `headless_validated_checkout_total`.
 * For defence in depth, you may add Woo-side validation here (e.g. recalculate line totals from
 * catalog and compare to session totals) before redirecting to payment.
 *
 * CONFIGURATION (wp-config.php recommended)
 * -----------------------------------------
 * define('JOYA_NEXT_API_BASE', 'https://your-next-app.example.com'); // no trailing slash
 * define('JOYA_CHECKOUT_SESSION_SECRET', 'same-as-CHECKOUT_SESSION_SERVER_SECRET-in-Next');
 *
 * Optional: payment method id if not "eway":
 * define('JOYA_EWAY_GATEWAY_ID', 'eway_payments');
 */

if (!defined('ABSPATH')) {
    exit;
}

if (defined('JOYA_HEADLESS_CHECKOUT_TOKEN_LOADED')) {
    return;
}
define('JOYA_HEADLESS_CHECKOUT_TOKEN_LOADED', true);

if (!defined('JOYA_NEXT_API_BASE') || !defined('JOYA_CHECKOUT_SESSION_SECRET')) {
    return;
}

if (!function_exists('WC')) {
    return;
}

if (!defined('JOYA_EWAY_GATEWAY_ID')) {
    define('JOYA_EWAY_GATEWAY_ID', 'eway_payments');
}

/** Parcel protection fee in AUD — keep aligned with Next `PARCEL_PROTECTION_FEE_AUD` */
if (!defined('JOYA_PARCEL_PROTECTION_FEE_AUD')) {
    define('JOYA_PARCEL_PROTECTION_FEE_AUD', 6.0);
}

/**
 * Early init: run before most output; stop after redirect.
 */
add_action(
    'init',
    function () {
        try {
        if (is_admin() || (defined('DOING_CRON') && DOING_CRON)) {
            return;
        }

        if (empty($_GET['checkout_token']) || !is_string($_GET['checkout_token'])) {
            return;
        }

        $token = sanitize_text_field(wp_unslash($_GET['checkout_token']));
        if (strlen($token) < 16) {
            wp_die(
                esc_html__('Invalid checkout link.', 'joya'),
                esc_html__('Checkout', 'joya'),
                ['response' => 400]
            );
        }

        $url = rtrim(JOYA_NEXT_API_BASE, '/') . '/api/checkout/get-session';
        $response = wp_remote_post(
            $url,
            [
                'timeout' => 30,
                'headers' => [
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                    'Authorization' => 'Bearer ' . JOYA_CHECKOUT_SESSION_SECRET,
                ],
                'body' => wp_json_encode(
                    [
                        'token' => $token,
                        'consume' => true,
                    ]
                ),
            ]
        );

        if (is_wp_error($response)) {
            error_log('[joya-headless-checkout] get-session transport error: ' . $response->get_error_message());
            wp_die(
                esc_html__('Unable to verify checkout. Please try again or contact us.', 'joya'),
                esc_html__('Checkout', 'joya'),
                ['response' => 502]
            );
        }

        $code = wp_remote_retrieve_response_code($response);
        $body_raw = wp_remote_retrieve_body($response);
        $data = json_decode($body_raw, true);

        if ($code !== 200 || empty($data['success']) || empty($data['session']) || !is_array($data['session'])) {
            $msg = isset($data['error']) ? (string) $data['error'] : 'Session validation failed';
            error_log('[joya-headless-checkout] get-session failed HTTP ' . $code . ' body=' . substr($body_raw, 0, 500));
            wp_die(esc_html($msg), esc_html__('Checkout', 'joya'), ['response' => $code >= 400 && $code < 600 ? $code : 400]);
        }

        $session = $data['session'];

        try {
            $order = joya_headless_build_order_from_session($session);
        } catch (Throwable $e) {
            error_log('[joya-headless-checkout] build order: ' . $e->getMessage());
            wp_die(
                esc_html__('Could not create your order. Please return to the store and try again.', 'joya'),
                esc_html__('Checkout', 'joya'),
                ['response' => 500]
            );
        }

        $pay_url = $order->get_checkout_payment_url(true);
        wp_safe_redirect($pay_url);
        exit;
        } catch (Throwable $e) {
            error_log('[joya-headless-checkout] fatal in token flow: ' . $e->getMessage());
            wp_die(
                esc_html__('Checkout is temporarily unavailable. Please try again shortly.', 'joya'),
                esc_html__('Checkout', 'joya'),
                ['response' => 500]
            );
        }
    },
    1
);

/**
 * @param array $session Payload from Next.js CheckoutSessionPublic
 */
function joya_headless_build_order_from_session(array $session): WC_Order
{
    $order = wc_create_order(['status' => 'pending']);

    if (!empty($session['user_id'])) {
        $order->set_customer_id(absint($session['user_id']));
    }

    $locked_rows = isset($session['woo_line_items']) && is_array($session['woo_line_items'])
        ? $session['woo_line_items']
        : [];
    if (!empty($locked_rows)) {
        foreach ($locked_rows as $row) {
            $pid = isset($row['product_id']) ? absint($row['product_id']) : 0;
            $qty = isset($row['quantity']) ? absint($row['quantity']) : 0;
            $vid = isset($row['variation_id']) ? absint($row['variation_id']) : 0;
            if ($pid < 1 || $qty < 1) {
                continue;
            }
            $product_id_for_line = $vid > 0 ? $vid : $pid;
            $product = wc_get_product($product_id_for_line);
            if (!$product) {
                throw new RuntimeException('Product not found: ' . $product_id_for_line);
            }

            $item = new WC_Order_Item_Product();
            $item->set_product($product);
            $item->set_quantity($qty);

            $subtotal_raw = isset($row['subtotal']) ? (string) $row['subtotal'] : '';
            $total_raw = isset($row['total']) ? (string) $row['total'] : '';
            if ($subtotal_raw !== '') {
                $item->set_subtotal(wc_format_decimal($subtotal_raw));
            }
            if ($total_raw !== '') {
                $item->set_total(wc_format_decimal($total_raw));
            } elseif ($subtotal_raw !== '') {
                $item->set_total(wc_format_decimal($subtotal_raw));
            }

            if (!empty($row['meta_data']) && is_array($row['meta_data'])) {
                foreach ($row['meta_data'] as $meta) {
                    if (!is_array($meta) || empty($meta['key'])) {
                        continue;
                    }
                    $mkey = sanitize_key((string) $meta['key']);
                    $mval = isset($meta['value']) ? $meta['value'] : '';
                    $item->add_meta_data($mkey, $mval, true);
                }
            }
            $order->add_item($item);
        }
    } else {
        $line_items = isset($session['line_items']) && is_array($session['line_items']) ? $session['line_items'] : [];
        foreach ($line_items as $row) {
            $pid = isset($row['product_id']) ? absint($row['product_id']) : 0;
            $qty = isset($row['quantity']) ? absint($row['quantity']) : 0;
            if ($pid < 1 || $qty < 1) {
                continue;
            }
            $product = wc_get_product($pid);
            if (!$product) {
                throw new RuntimeException('Product not found: ' . $pid);
            }
            $args = [];
            if (!empty($row['variation_id'])) {
                $args['variation_id'] = absint($row['variation_id']);
            }
            $order->add_product($product, $qty, $args);
        }
    }

    $billing_addr = !empty($session['billing']) && is_array($session['billing'])
        ? array_map('joya_headless_clean_addr', $session['billing'])
        : [];
    if (!empty($billing_addr)) {
        $order->set_address($billing_addr, 'billing');
    }

    $shipping_addr = !empty($session['shipping']) && is_array($session['shipping'])
        ? array_map('joya_headless_clean_addr', $session['shipping'])
        : [];
    // Defensive fallback: order-pay can fail shipping resolution when shipping address is partial.
    foreach (['first_name', 'last_name', 'address_1', 'city', 'postcode', 'country', 'state'] as $k) {
        if ((empty($shipping_addr[$k]) || !is_string($shipping_addr[$k])) && !empty($billing_addr[$k])) {
            $shipping_addr[$k] = $billing_addr[$k];
        }
    }
    if (empty($shipping_addr['country'])) {
        $shipping_addr['country'] = 'AU';
    }
    if (!empty($shipping_addr)) {
        $order->set_address($shipping_addr, 'shipping');
    }

    // Always persist one shipping line so order-pay does not attempt package rate lookup.
    $ship = !empty($session['shipping_line']) && is_array($session['shipping_line'])
        ? $session['shipping_line']
        : [];
    if (!empty($session['shipping_method_id']) && empty($ship['method_id'])) {
        $ship['method_id'] = (string) $session['shipping_method_id'];
    }
    if (empty($ship['total']) && !empty($session['totals']) && is_array($session['totals']) && isset($session['totals']['shipping'])) {
        $ship['total'] = (string) $session['totals']['shipping'];
    }
    if (!empty($ship['method_id']) || array_key_exists('total', $ship)) {
        $item = new WC_Order_Item_Shipping();
        $method_id_raw = isset($ship['method_id']) ? (string) $ship['method_id'] : 'headless';
        $method_id = $method_id_raw;
        $instance_id = isset($ship['instance_id']) ? absint($ship['instance_id']) : 0;
        // Accept both "flat_rate" and "flat_rate:3" forms from headless payloads.
        if (strpos($method_id_raw, ':') !== false) {
            $parts = explode(':', $method_id_raw, 2);
            $method_id = sanitize_key((string) ($parts[0] ?? 'headless'));
            if ($instance_id < 1 && isset($parts[1])) {
                $instance_id = absint($parts[1]);
            }
        } else {
            $method_id = sanitize_key($method_id_raw);
        }
        $item->set_method_id($method_id ?: 'headless');
        if ($instance_id > 0 && method_exists($item, 'set_instance_id')) {
            $item->set_instance_id($instance_id);
        } elseif ($instance_id > 0) {
            $item->add_meta_data('instance_id', $instance_id, true);
        }
        $item->set_method_title(isset($ship['method_title']) ? (string) $ship['method_title'] : __('Shipping', 'joya'));
        $total = isset($ship['total']) ? wc_format_decimal((string) $ship['total']) : '0';
        $item->set_total($total);
        $item->set_total_tax(0);
        $order->add_item($item);
    }

    if (!empty($session['coupon_code'])) {
        $order->apply_coupon(sanitize_text_field((string) $session['coupon_code']));
    }

    $insurance = isset($session['insurance_option']) ? (string) $session['insurance_option'] : 'no';
    if ($insurance === 'yes') {
        $fee = new WC_Order_Item_Fee();
        $fee->set_name(__('Parcel protection', 'joya'));
        $fee->set_total(JOYA_PARCEL_PROTECTION_FEE_AUD);
        $fee->set_tax_status('none');
        $order->add_item($fee);
    }

    /**
     * Do not rely on `get_available_payment_gateways()` during token handoff (`init`):
     * some gateway plugins expect checkout session context and can fatal here.
     * Set a stable gateway id, then optionally enrich title when gateway objects are ready.
     */
    $gateway_id = sanitize_key((string) JOYA_EWAY_GATEWAY_ID);
    if ($gateway_id === '') {
        $gateway_id = 'eway_payments';
    }
    $order->set_payment_method($gateway_id);

    $title_set = false;
    if (function_exists('WC')) {
        $wc = WC();
        if ($wc && method_exists($wc, 'payment_gateways')) {
            $pg = $wc->payment_gateways();
            if ($pg && method_exists($pg, 'payment_gateways')) {
                $all_gateways = $pg->payment_gateways();
                if (is_array($all_gateways) && isset($all_gateways[$gateway_id]) && is_object($all_gateways[$gateway_id]) && method_exists($all_gateways[$gateway_id], 'get_title')) {
                    $order->set_payment_method_title((string) $all_gateways[$gateway_id]->get_title());
                    $title_set = true;
                }
            }
        }
    }
    if (!$title_set) {
        $order->set_payment_method_title('Credit Card');
    }

    if (!empty($session['meta_data']) && is_array($session['meta_data'])) {
        foreach ($session['meta_data'] as $meta) {
            if (empty($meta['key'])) {
                continue;
            }
            $order->update_meta_data(sanitize_key((string) $meta['key']), isset($meta['value']) ? $meta['value'] : '');
        }
    }

    $order->calculate_totals();

    /**
     * Align grand total with the Next.js checkout quote (coupon, GST, shipping).
     * Woo calculate_totals() alone can diverge from headless pricing; eWAY uses WC_Order::get_total().
     * Meta key matches Next headless_validated_checkout_total used on REST /api/checkout orders.
     */
    if (!empty($session['totals']) && is_array($session['totals']) && isset($session['totals']['total'])) {
        $headless_grand = (float) $session['totals']['total'];
        if ($headless_grand > 0) {
            $as_string = wc_format_decimal($headless_grand);
            $order->update_meta_data('headless_validated_checkout_total', $as_string);
            $order->set_total($as_string);
        }
    }

    $order->save();

    return $order;
}

/**
 * @param mixed $v
 */
function joya_headless_clean_addr($v): string
{
    if (is_scalar($v)) {
        return sanitize_text_field((string) $v);
    }
    return '';
}

/**
 * Auto-advance Pay button on order-pay (eWAY hosted fields often need a user gesture; this helps when the gateway allows it).
 */
add_action(
    'wp_footer',
    function () {
        if (!function_exists('is_wc_endpoint_url') || !is_wc_endpoint_url('order-pay')) {
            return;
        }
        if (empty($_GET['pay_for_order']) && empty($_GET['key'])) {
            return;
        }
        ?>
        <script>
        (function () {
          document.addEventListener('DOMContentLoaded', function () {
            var btn = document.getElementById('place_order');
            if (!btn) {
              btn = document.querySelector('#order_review button[type="submit"], form#order_review input#place_order');
            }
            if (btn && !btn.dataset.joyaAutoPayDone) {
              btn.dataset.joyaAutoPayDone = '1';
              try { btn.click(); } catch (e) { /* some gateways block programmatic click */ }
            }
          });
        })();
        </script>
        <?php
    },
    99
);

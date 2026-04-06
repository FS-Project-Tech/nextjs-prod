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
        if (is_admin() || (defined('DOING_CRON') && DOING_CRON)) {
            return;
        }

        if (empty($_GET['checkout_token']) || !is_string($_GET['checkout_token'])) {
            return;
        }

        $token = sanitize_text_field(wp_unslash($_GET['checkout_token']));
        if (strlen($token) < 16) {
            wp_die(esc_html__('Invalid checkout link.', 'joya'), 400);
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
            wp_die(esc_html__('Unable to verify checkout. Please try again or contact us.', 'joya'), 502);
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
            wp_die(esc_html__('Could not create your order. Please return to the store and try again.', 'joya'), 500);
        }

        $pay_url = $order->get_checkout_payment_url(true);
        wp_safe_redirect($pay_url);
        exit;
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

    if (!empty($session['billing']) && is_array($session['billing'])) {
        $order->set_address(array_map('joya_headless_clean_addr', $session['billing']), 'billing');
    }
    if (!empty($session['shipping']) && is_array($session['shipping'])) {
        $order->set_address(array_map('joya_headless_clean_addr', $session['shipping']), 'shipping');
    }

    if (!empty($session['shipping_line']) && is_array($session['shipping_line'])) {
        $ship = $session['shipping_line'];
        $item = new WC_Order_Item_Shipping();
        $method_id = isset($ship['method_id']) ? (string) $ship['method_id'] : 'headless';
        $item->set_method_id($method_id);
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

    $gateway_id = JOYA_EWAY_GATEWAY_ID;
    $available = WC()->payment_gateways()->get_available_payment_gateways();
    if (!isset($available[$gateway_id])) {
        foreach (['eway_payments', 'eway'] as $fallback) {
            if (isset($available[$fallback])) {
                $gateway_id = $fallback;
                break;
            }
        }
    }
    if (!isset($available[$gateway_id])) {
        $keys = array_keys($available);
        $gateway_id = $keys[0] ?? 'bacs';
    }

    $order->set_payment_method($gateway_id);
    if (isset($available[$gateway_id])) {
        $order->set_payment_method_title($available[$gateway_id]->get_title());
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

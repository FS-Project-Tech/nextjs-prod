<?php
/**
 * Plugin Name: Joya Headless Checkout Field Meta (MU)
 * Description: Persists headless/API checkout extras ("Signature Required", paperwork, discreet packaging)
 *              from checkout data meta_data — not only $_POST. Normalize values to yes/no for admin/emails.
 * Version: 1.0.0
 *
 * Install: copy to wp-content/mu-plugins/ (alongside other Joya MU plugins).
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('WC')) {
    return;
}

/** Human-readable keys aligned with Woo admin + Next.js order meta_data. */
const JOYA_HEADLESS_CHECKOUT_META_KEYS = [
    'Signature Required',
    'Do not Send Paperwork With Delivery',
    'Discreet Packaging',
];

/**
 * @param mixed $meta REST row, WC meta object, or array shape [ key, value ].
 * @return array{0:string,1:mixed}
 */
function joya_headless_checkout_meta_kv($meta): array {
    if (is_object($meta)) {
        $key = isset($meta->key) ? (string) $meta->key : '';
        $value = $meta->value ?? null;
        return [$key, $value];
    }
    if (is_array($meta)) {
        $key = isset($meta['key']) ? (string) $meta['key'] : '';
        $value = $meta['value'] ?? null;
        return [$key, $value];
    }
    return ['', null];
}

/** Store yes/no strings for WooCommerce emails and admin. */
function joya_headless_checkout_normalize_yes_no($value): string {
    if (is_bool($value)) {
        return $value ? 'yes' : 'no';
    }
    if (is_numeric($value)) {
        return ((int) $value) !== 0 ? 'yes' : 'no';
    }
    $s = strtolower(trim((string) $value));
    if ($s === 'yes' || $s === '1' || $s === 'true' || $s === 'on') {
        return 'yes';
    }
    return 'no';
}

/**
 * Classic / Store checkout: $data['meta_data'] may contain API-shaped rows (objects or arrays).
 *
 * @param WC_Order $order Order being created.
 * @param array    $data  Checkout posted / normalized data.
 */
add_action(
    'woocommerce_checkout_create_order',
    static function ($order, $data) {
        if (!$order instanceof WC_Order || empty($data['meta_data']) || !is_iterable($data['meta_data'])) {
            return;
        }
        foreach ($data['meta_data'] as $meta) {
            [$key, $value] = joya_headless_checkout_meta_kv($meta);
            if (!in_array($key, JOYA_HEADLESS_CHECKOUT_META_KEYS, true)) {
                continue;
            }
            $order->update_meta_data($key, joya_headless_checkout_normalize_yes_no($value));
        }
    },
    10,
    2
);

/**
 * REST API: reinforce the three keys on the order before insert (normalized yes/no).
 * Core often maps meta_data already; this keeps headless payloads consistent.
 *
 * @param WC_Order                          $order
 * @param WP_REST_Request                   $request
 * @param bool                              $creating
 */
add_filter(
    'woocommerce_rest_pre_insert_shop_order_object',
    static function ($order, $request, $creating) {
        if (!$order instanceof WC_Order) {
            return $order;
        }
        $meta_data = $request->get_param('meta_data');
        if (!is_array($meta_data)) {
            return $order;
        }
        foreach ($meta_data as $meta) {
            if (!is_array($meta) && !is_object($meta)) {
                continue;
            }
            [$key, $value] = joya_headless_checkout_meta_kv($meta);
            if (!in_array($key, JOYA_HEADLESS_CHECKOUT_META_KEYS, true)) {
                continue;
            }
            $order->update_meta_data($key, joya_headless_checkout_normalize_yes_no($value));
        }
        return $order;
    },
    10,
    3
);

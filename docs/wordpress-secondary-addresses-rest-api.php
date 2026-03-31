<?php
/**
 * WordPress REST API: Customer Billing/Shipping Address (Secondary)
 *
 * Exposes billing2_* and shipping2_* user meta so the headless app's
 * "Addresses" page reads/writes addresses. Same fields as the admin form
 * in wordpress-functions-secondary-addresses.php (paste that into functions.php
 * and require this file from the same theme folder).
 *
 * Endpoints:
 *   GET    /wp-json/customers/v1/addresses-secondary     → list billing2 + shipping2
 *   POST   /wp-json/customers/v1/addresses-secondary     → create/update (body: type=billing|shipping + fields)
 *   PUT    /wp-json/customers/v1/addresses-secondary/billing2|shipping2
 *   DELETE /wp-json/customers/v1/addresses-secondary/billing2|shipping2
 *
 * REQUIREMENTS:
 * - Add this file to your theme folder and require it from functions.php
 *   (see wordpress-functions-secondary-addresses.php – it ends with require_once this file).
 * - REST requests must be authenticated (JWT plugin so "Authorization: Bearer <JWT>"
 *   sets the current user). Otherwise is_user_logged_in() is false and endpoints return 401.
 *
 * Optional: POST/PUT body can include "sync_primary": true to also update
 * WooCommerce primary billing_* / shipping_* user meta.
 */

if (!defined('ABSPATH')) {
    exit;
}

$billing2_keys = array(
    'first_name', 'last_name', 'company', 'address_1', 'address_2',
    'city', 'state', 'postcode', 'country', 'phone', 'email',
    'ndis_participant_name', 'ndis_number', 'ndis_dob', 'ndis_funding_type', 'ndis_approval',
    'ndis_invoice_email',
    'hcp_participant_name', 'hcp_number', 'hcp_provider_email', 'hcp_approval'
);
$shipping2_keys = array(
    'first_name', 'last_name', 'company', 'address_1', 'address_2',
    'city', 'state', 'postcode', 'country', 'phone', 'email',
    'ndis_participant_name', 'ndis_number', 'ndis_dob', 'ndis_funding_type', 'ndis_approval',
    'ndis_invoice_email',
    'hcp_participant_name', 'hcp_number', 'hcp_provider_email', 'hcp_approval'
);

function secondary_address_meta_prefix($type) {
    return $type === 'billing' ? 'billing2_' : 'shipping2_';
}

function get_secondary_address_from_meta($user_id, $type, $billing2_keys, $shipping2_keys) {
    $prefix = secondary_address_meta_prefix($type);
    $keys = $type === 'billing' ? $billing2_keys : $shipping2_keys;
    $out = array('id' => $type === 'billing' ? 'billing2' : 'shipping2', 'type' => $type, 'label' => '');
    foreach ($keys as $k) {
        $val = get_user_meta($user_id, $prefix . $k, true);
        $out[$k] = ($val !== '' && $val !== false) ? $val : '';
    }
    $out['label'] = $type === 'billing' ? 'Billing (Secondary)' : 'Shipping (Secondary)';
    return $out;
}

function has_any_secondary_data($arr, $keys) {
    foreach ($keys as $k) {
        if (isset($arr[$k]) && trim((string)$arr[$k]) !== '') return true;
    }
    return false;
}

function save_secondary_address_to_meta($user_id, $type, $body, $billing2_keys, $shipping2_keys) {
    $prefix = secondary_address_meta_prefix($type);
    $keys = $type === 'billing' ? $billing2_keys : $shipping2_keys;
    foreach ($keys as $k) {
        if (!isset($body[$k])) {
            $v = '';
        } elseif (is_bool($body[$k])) {
            $v = $body[$k] ? '1' : '0';
        } else {
            $v = sanitize_text_field((string) $body[$k]);
        }
        update_user_meta($user_id, $prefix . $k, $v);
    }

    // Optional: also update WooCommerce primary billing/shipping meta (billing_* / shipping_*)
    // Only do this when the client explicitly asks (e.g. checkout address save).
    $sync_primary = false;
    if (isset($body['sync_primary'])) {
        $sync_primary = ($body['sync_primary'] === true || $body['sync_primary'] === 1 || $body['sync_primary'] === '1' || $body['sync_primary'] === 'true');
    }

    if ($sync_primary) {
        $primary_prefix = $type === 'billing' ? 'billing_' : 'shipping_';
        $primary_keys = array('first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country', 'phone', 'email');
        foreach ($primary_keys as $k) {
            if (!array_key_exists($k, $body)) {
                $v = '';
            } elseif (is_bool($body[$k])) {
                $v = $body[$k] ? '1' : '0';
            } else {
                $v = sanitize_text_field((string) (isset($body[$k]) ? $body[$k] : ''));
            }
            update_user_meta($user_id, $primary_prefix . $k, $v);
        }
    }
}

function clear_secondary_address_meta($user_id, $type, $billing2_keys, $shipping2_keys) {
    $prefix = secondary_address_meta_prefix($type);
    $keys = $type === 'billing' ? $billing2_keys : $shipping2_keys;
    foreach ($keys as $k) {
        delete_user_meta($user_id, $prefix . $k);
    }
}

add_action('rest_api_init', function () use ($billing2_keys, $shipping2_keys) {
    // Debug: call GET /wp-json/customers/v1/addresses-secondary-debug with header "Authorization: Bearer YOUR_JWT"
    // to see if the header reaches PHP and if the user is set (so POST will save to DB).
    register_rest_route('customers/v1', '/addresses-secondary-debug', array(
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function () {
            $auth = !empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
            $user_id = get_current_user_id();
            $message = $user_id
                ? 'JWT accepted; user is set. POST to addresses-secondary will save to DB and show in Edit User.'
                : ($auth
                    ? 'Authorization header is present but user is 0. Check JWT_AUTH_SECRET_KEY in wp-config.php and that JWT Authentication for WP REST API is active.'
                    : 'Authorization header is missing. Add the .htaccess rule so Bearer token reaches PHP (see JWT_WORDPRESS_SETUP.md).');
            return new WP_REST_Response(array(
                'auth_header_present' => $auth,
                'user_id'            => $user_id,
                'message'            => $message,
            ), 200);
        },
    ));

    register_rest_route('customers/v1', '/addresses-secondary', array(
        array(
            'methods'             => 'GET',
            'permission_callback' => function () {
                return is_user_logged_in();
            },
            'callback'            => function () use ($billing2_keys, $shipping2_keys) {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('error' => 'Not authenticated'), 401);
                }
                $billing  = get_secondary_address_from_meta($user_id, 'billing', $billing2_keys, $shipping2_keys);
                $shipping = get_secondary_address_from_meta($user_id, 'shipping', $billing2_keys, $shipping2_keys);
                $addresses = array();
                if (has_any_secondary_data($billing, $billing2_keys)) {
                    $addresses[] = $billing;
                }
                if (has_any_secondary_data($shipping, $shipping2_keys)) {
                    $addresses[] = $shipping;
                }
                return new WP_REST_Response(array('addresses' => $addresses), 200);
            },
        ),
        array(
            'methods'             => 'POST',
            'permission_callback' => function () {
                return is_user_logged_in();
            },
            'callback'            => function ($request) use ($billing2_keys, $shipping2_keys) {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('error' => 'Not authenticated'), 401);
                }
                $body = $request->get_json_params();
                if (!is_array($body)) $body = array();
                $type = isset($body['type']) && $body['type'] === 'shipping' ? 'shipping' : 'billing';
                save_secondary_address_to_meta($user_id, $type, $body, $billing2_keys, $shipping2_keys);
                $address = get_secondary_address_from_meta($user_id, $type, $billing2_keys, $shipping2_keys);
                return new WP_REST_Response(array(
                    'address'  => $address,
                    'message'  => 'Address saved successfully',
                ), 200);
            },
        ),
    ));

    register_rest_route('customers/v1', '/addresses-secondary/(?P<id>billing2|shipping2)', array(
        array(
            'methods'             => 'PUT',
            'permission_callback' => function () {
                return is_user_logged_in();
            },
            'callback'            => function ($request) use ($billing2_keys, $shipping2_keys) {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('error' => 'Not authenticated'), 401);
                }
                $id = $request['id'];
                $type = $id === 'billing2' ? 'billing' : 'shipping';
                $body = $request->get_json_params();
                if (!is_array($body)) $body = array();
                save_secondary_address_to_meta($user_id, $type, $body, $billing2_keys, $shipping2_keys);
                $address = get_secondary_address_from_meta($user_id, $type, $billing2_keys, $shipping2_keys);
                return new WP_REST_Response(array(
                    'address'  => $address,
                    'message'  => 'Address updated successfully',
                ), 200);
            },
        ),
        array(
            'methods'             => 'DELETE',
            'permission_callback' => function () {
                return is_user_logged_in();
            },
            'callback'            => function ($request) use ($billing2_keys, $shipping2_keys) {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('error' => 'Not authenticated'), 401);
                }
                $id = $request['id'];
                $type = $id === 'billing2' ? 'billing' : 'shipping';
                clear_secondary_address_meta($user_id, $type, $billing2_keys, $shipping2_keys);
                return new WP_REST_Response(array('message' => 'Address deleted successfully'), 200);
            },
        ),
    ));
});

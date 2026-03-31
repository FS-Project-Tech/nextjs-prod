# WordPress Secondary Addresses – Full reference & fixing critical error

## Why you see "There has been a critical error"

Common causes:

1. **wordpress-secondary-addresses-rest-api.php** contains extra code (admin form or `save_secondary_addresses` or `require_once`). That can cause "Cannot redeclare function" and crash the site.
2. **wordpress-secondary-addresses-rest-api.php** is missing from the theme folder, so `require_once` in functions.php fails.
3. **Wrong theme path** – the file must be in the same folder as `functions.php`.

**Fix:** Use exactly two files as below. The REST file must contain **only** the REST API code (nothing else). Your `functions.php` keeps your admin form + save + the one `require_once` line.

---

## File 1: wordpress-secondary-addresses-rest-api.php

**Path:**  
`/applications/avvxsaxstm/public_html/wp-content/themes/bootscore-child/wordpress-secondary-addresses-rest-api.php`

This file must contain **only** the following. Do not add the admin form, `save_secondary_addresses`, or any `require_once` inside this file.

```php
<?php
/**
 * WordPress REST API: Customer Billing/Shipping Address (Secondary)
 *
 * Exposes billing2_* and shipping2_* user meta so the headless app's
 * "Addresses" page reads/writes Customer Billing Address (Secondary)
 * and Customer Shipping Address (Secondary). Checkout continues to use
 * primary billing/shipping.
 *
 * REQUIREMENTS:
 * - Add this file to your theme (e.g. require in functions.php).
 * - WordPress must authenticate REST API requests when the app sends
 *   "Authorization: Bearer <JWT>".
 */

if (!defined('ABSPATH')) {
    exit;
}

$billing2_keys = array(
    'first_name', 'last_name', 'company', 'address_1', 'address_2',
    'city', 'state', 'postcode', 'country', 'phone', 'email'
);
$shipping2_keys = array(
    'first_name', 'last_name', 'company', 'address_1', 'address_2',
    'city', 'state', 'postcode', 'country', 'phone', 'email'
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
        $out[$k] = $val !== '' && $val !== false ? $val : '';
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
        $v = isset($body[$k]) ? sanitize_text_field($body[$k]) : '';
        update_user_meta($user_id, $prefix . $k, $v);
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
```

---

## File 2: functions.php (only the secondary-addresses block)

**Path:**  
`/applications/avvxsaxstm/public_html/wp-content/themes/bootscore-child/functions.php`  

(WordPress requires the name **functions.php** with an "s".)

At the **end** of `functions.php`, have **only** this block (your admin form + save + one require). Do **not** put the REST API code (the `$billing2_keys`, `register_rest_route`, etc.) in functions.php.

```php
// Add Duplicate Billing & Shipping Sections
add_action('show_user_profile', 'add_secondary_addresses');
add_action('edit_user_profile', 'add_secondary_addresses');

function add_secondary_addresses($user) {
    ?>
    <h2>Customer Billing Address (Secondary)</h2>
    <table class="form-table">
        <tr>
            <th><label>First Name</label></th>
            <td>
                <input type="text" name="billing2_first_name" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_first_name', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Last Name</label></th>
            <td>
                <input type="text" name="billing2_last_name" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_last_name', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Company</label></th>
            <td>
                <input type="text" name="billing2_company" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_company', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Address Line 1</label></th>
            <td>
                <input type="text" name="billing2_address_1" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_address_1', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>City</label></th>
            <td>
                <input type="text" name="billing2_city" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_city', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Postcode</label></th>
            <td>
                <input type="text" name="billing2_postcode" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_postcode', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Phone</label></th>
            <td>
                <input type="text" name="billing2_phone" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_phone', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Email</label></th>
            <td>
                <input type="email" name="billing2_email" value="<?php echo esc_attr(get_user_meta($user->ID, 'billing2_email', true)); ?>" class="regular-text" />
            </td>
        </tr>
    </table>

    <h2>Customer Shipping Address (Secondary)</h2>
    <table class="form-table">
        <tr>
            <th><label>First Name</label></th>
            <td>
                <input type="text" name="shipping2_first_name" value="<?php echo esc_attr(get_user_meta($user->ID, 'shipping2_first_name', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Last Name</label></th>
            <td>
                <input type="text" name="shipping2_last_name" value="<?php echo esc_attr(get_user_meta($user->ID, 'shipping2_last_name', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Company</label></th>
            <td>
                <input type="text" name="shipping2_company" value="<?php echo esc_attr(get_user_meta($user->ID, 'shipping2_company', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Address Line 1</label></th>
            <td>
                <input type="text" name="shipping2_address_1" value="<?php echo esc_attr(get_user_meta($user->ID, 'shipping2_address_1', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>City</label></th>
            <td>
                <input type="text" name="shipping2_city" value="<?php echo esc_attr(get_user_meta($user->ID, 'shipping2_city', true)); ?>" class="regular-text" />
            </td>
        </tr>
        <tr>
            <th><label>Postcode</label></th>
            <td>
                <input type="text" name="shipping2_postcode" value="<?php echo esc_attr(get_user_meta($user->ID, 'shipping2_postcode', true)); ?>" class="regular-text" />
            </td>
        </tr>
    </table>
    <?php
}

add_action('personal_options_update', 'save_secondary_addresses');
add_action('edit_user_profile_update', 'save_secondary_addresses');

function save_secondary_addresses($user_id) {
    if (!current_user_can('edit_user', $user_id)) {
        return false;
    }
    $fields = array(
        'billing2_first_name', 'billing2_last_name', 'billing2_company',
        'billing2_address_1', 'billing2_city', 'billing2_postcode',
        'billing2_phone', 'billing2_email',
        'shipping2_first_name', 'shipping2_last_name',
        'shipping2_company', 'shipping2_address_1',
        'shipping2_city', 'shipping2_postcode'
    );
    foreach ($fields as $field) {
        if (isset($_POST[$field])) {
            update_user_meta($user_id, $field, sanitize_text_field($_POST[$field]));
        }
    }
}

// Load REST API for dashboard Addresses → Customer Billing/Shipping Address (Secondary)
require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';
```

---

## Checklist to fix the critical error

1. **REST file** – Replace the full content of `wordpress-secondary-addresses-rest-api.php` with **only** the "File 1" code above. No admin form, no `save_secondary_addresses`, no `require_once` inside this file.
2. **Theme folder** – Ensure `wordpress-secondary-addresses-rest-api.php` exists in `bootscore-child` (same folder as `functions.php`).
3. **functions.php** – Keep your existing theme code and add (or keep) at the end **only** the "File 2" block above. Do not paste the REST API code into functions.php.
4. **Filename** – The theme file must be named `functions.php` (with an "s"), not `function.php`.

The REST code above uses `array()` instead of `[]` and avoids `?:` so it runs on older PHP versions that some hosts still use. After updating both files, try loading the site and logging in again.

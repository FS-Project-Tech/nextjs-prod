# WordPress secondary addresses – where each part goes

Use **two places** so the REST API and the admin form don’t conflict.

---

## 1. File: `wordpress-secondary-addresses-rest-api.php` (in theme folder)

This file must contain **only** the REST API: the block from `<?php` and the doc comment down to the closing `});` of `rest_api_init`.  
Do **not** put the admin form, `save_secondary_addresses`, or any `require_once` in this file.

- Path: `wp-content/themes/bootscore-child/wordpress-secondary-addresses-rest-api.php`
- Content: copy the **entire** contents of `docs/wordpress-secondary-addresses-rest-api.php` from this repo (lines 1–162, REST only).

---

## 2. File: `functions.php` (in theme folder)

This file must contain **only**:

1. The admin form and hooks: `add_secondary_addresses` (with the two `add_action` lines).
2. The save logic: `save_secondary_addresses` (with its two `add_action` lines).
3. One line at the end to load the REST file:

```php
// Add Duplicate Billing & Shipping Sections (admin form)
add_action('show_user_profile', 'add_secondary_addresses');
add_action('edit_user_profile', 'add_secondary_addresses');

function add_secondary_addresses($user) {
    ?>
    <h2>Customer Billing Address (Secondary)</h2>
    <table class="form-table">
        <!-- ... all your billing2 inputs ... -->
    </table>
    <h2>Customer Shipping Address (Secondary)</h2>
    <table class="form-table">
        <!-- ... all your shipping2 inputs ... -->
    </table>
    <?php
}

add_action('personal_options_update', 'save_secondary_addresses');
add_action('edit_user_profile_update', 'save_secondary_addresses');

function save_secondary_addresses($user_id) {
    if (!current_user_can('edit_user', $user_id)) {
        return false;
    }
    $fields = [
        'billing2_first_name','billing2_last_name','billing2_company',
        'billing2_address_1','billing2_city','billing2_postcode',
        'billing2_phone','billing2_email',
        'shipping2_first_name','shipping2_last_name',
        'shipping2_company','shipping2_address_1',
        'shipping2_city','shipping2_postcode'
    ];
    foreach ($fields as $field) {
        if (isset($_POST[$field])) {
            update_user_meta($user_id, $field, sanitize_text_field($_POST[$field]));
        }
    }
}

// Load REST API for dashboard Addresses → Customer Billing/Shipping Address (Secondary)
require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';
```

Do **not** put the REST API code (`$billing2_keys`, `register_rest_route`, etc.) inside `functions.php`; it belongs only in `wordpress-secondary-addresses-rest-api.php`.

---

## Summary

| Location | Contains |
|----------|----------|
| **wordpress-secondary-addresses-rest-api.php** | Only REST API (GET/POST/PUT/DELETE for `addresses-secondary`). No form, no save, no require. |
| **functions.php** | Admin form (`add_secondary_addresses`), save (`save_secondary_addresses`), and `require_once ... wordpress-secondary-addresses-rest-api.php`. |

If you had pasted everything into one file, split it as above so the REST file only registers routes and `functions.php` only has the form, save, and the one require.

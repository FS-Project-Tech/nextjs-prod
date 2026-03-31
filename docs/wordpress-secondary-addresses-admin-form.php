<?php
/**
 * WordPress Admin: Customer Billing/Shipping Address (Secondary) – form markup
 *
 * Use the same input structure as Address Book for WooCommerce / WooCommerce:
 * class="input-text form-control", unique ids (billing2_*, shipping2_*),
 * aria-required, autocomplete. Paste the add_secondary_addresses and
 * save_secondary_addresses code below into your theme's functions.php
 * (and keep the require_once for wordpress-secondary-addresses-rest-api.php).
 */

if (!defined('ABSPATH')) {
    exit;
}

// =============================================================================
// PASTE FROM HERE into functions.php (replace your existing add_secondary_addresses + save_secondary_addresses)
// =============================================================================

// Add Duplicate Billing & Shipping Sections (same markup as Address Book for WooCommerce)
add_action('show_user_profile', 'add_secondary_addresses');
add_action('edit_user_profile', 'add_secondary_addresses');

function add_secondary_addresses($user) {
    $uid = (int) $user->ID;
    ?>
    <h2><?php esc_html_e('Customer Billing Address (Secondary)', 'woocommerce'); ?></h2>
    <table class="form-table">
        <tr>
            <th><label for="billing2_first_name"><?php esc_html_e('First Name', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_first_name" id="billing2_first_name" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_first_name', true)); ?>" aria-required="true" autocomplete="given-name" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_last_name"><?php esc_html_e('Last Name', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_last_name" id="billing2_last_name" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_last_name', true)); ?>" aria-required="true" autocomplete="family-name" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_company"><?php esc_html_e('Company', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_company" id="billing2_company" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_company', true)); ?>" autocomplete="organization" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_address_1"><?php esc_html_e('Address Line 1', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_address_1" id="billing2_address_1" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_address_1', true)); ?>" aria-required="true" autocomplete="address-line1" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_address_2"><?php esc_html_e('Address Line 2', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_address_2" id="billing2_address_2" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_address_2', true)); ?>" autocomplete="address-line2" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_city"><?php esc_html_e('City', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_city" id="billing2_city" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_city', true)); ?>" aria-required="true" autocomplete="address-level2" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_state"><?php esc_html_e('State / County', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_state" id="billing2_state" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_state', true)); ?>" autocomplete="address-level1" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_postcode"><?php esc_html_e('Postcode', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_postcode" id="billing2_postcode" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_postcode', true)); ?>" aria-required="true" autocomplete="postal-code" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_country"><?php esc_html_e('Country', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="billing2_country" id="billing2_country" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_country', true)); ?>" autocomplete="country" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_phone"><?php esc_html_e('Phone', 'woocommerce'); ?></label></th>
            <td>
                <input type="tel" class="input-text form-control" name="billing2_phone" id="billing2_phone" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_phone', true)); ?>" aria-required="true" autocomplete="tel" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_email"><?php esc_html_e('Email', 'woocommerce'); ?></label></th>
            <td>
                <input type="email" class="input-text form-control" name="billing2_email" id="billing2_email" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_email', true)); ?>" aria-required="true" autocomplete="email" />
            </td>
        </tr>
    </table>

    <h2><?php esc_html_e('Customer Shipping Address (Secondary)', 'woocommerce'); ?></h2>
    <table class="form-table">
        <tr>
            <th><label for="shipping2_first_name"><?php esc_html_e('First Name', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_first_name" id="shipping2_first_name" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_first_name', true)); ?>" aria-required="true" autocomplete="given-name" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_last_name"><?php esc_html_e('Last Name', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_last_name" id="shipping2_last_name" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_last_name', true)); ?>" aria-required="true" autocomplete="family-name" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_company"><?php esc_html_e('Company', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_company" id="shipping2_company" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_company', true)); ?>" autocomplete="organization" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_address_1"><?php esc_html_e('Address Line 1', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_address_1" id="shipping2_address_1" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_address_1', true)); ?>" aria-required="true" autocomplete="address-line1" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_address_2"><?php esc_html_e('Address Line 2', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_address_2" id="shipping2_address_2" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_address_2', true)); ?>" autocomplete="address-line2" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_city"><?php esc_html_e('City', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_city" id="shipping2_city" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_city', true)); ?>" aria-required="true" autocomplete="address-level2" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_state"><?php esc_html_e('State / County', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_state" id="shipping2_state" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_state', true)); ?>" autocomplete="address-level1" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_postcode"><?php esc_html_e('Postcode', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_postcode" id="shipping2_postcode" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_postcode', true)); ?>" aria-required="true" autocomplete="postal-code" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_country"><?php esc_html_e('Country', 'woocommerce'); ?></label></th>
            <td>
                <input type="text" class="input-text form-control" name="shipping2_country" id="shipping2_country" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_country', true)); ?>" autocomplete="country" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_phone"><?php esc_html_e('Phone', 'woocommerce'); ?></label></th>
            <td>
                <input type="tel" class="input-text form-control" name="shipping2_phone" id="shipping2_phone" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_phone', true)); ?>" autocomplete="tel" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_email"><?php esc_html_e('Email', 'woocommerce'); ?></label></th>
            <td>
                <input type="email" class="input-text form-control" name="shipping2_email" id="shipping2_email" placeholder="" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_email', true)); ?>" autocomplete="email" />
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
    $fields = [
        'billing2_first_name', 'billing2_last_name', 'billing2_company',
        'billing2_address_1', 'billing2_address_2', 'billing2_city', 'billing2_state', 'billing2_postcode', 'billing2_country',
        'billing2_phone', 'billing2_email',
        'shipping2_first_name', 'shipping2_last_name', 'shipping2_company',
        'shipping2_address_1', 'shipping2_address_2', 'shipping2_city', 'shipping2_state', 'shipping2_postcode', 'shipping2_country',
        'shipping2_phone', 'shipping2_email',
    ];
    foreach ($fields as $field) {
        if (isset($_POST[$field])) {
            update_user_meta($user_id, $field, sanitize_text_field($_POST[$field]));
        }
    }
}

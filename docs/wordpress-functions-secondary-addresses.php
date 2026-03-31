<?php
/**
 * Paste this code into your theme's functions.php
 *
 * Example path: wp-content/themes/your-theme/functions.php
 * (WordPress expects the filename to be "functions.php" with an "s".)
 *
 * - Add this block at the end of functions.php (or replace your existing secondary-addresses block).
 * - Put wordpress-secondary-addresses-rest-api.php in the same theme folder; it is required at the bottom.
 * - When admin clicks "Update User", billing2_* and shipping2_* are saved so the dashboard Addresses
 *   page and REST API (customers/v1/addresses-secondary) stay in sync.
 */

// Add Duplicate Billing & Shipping Sections
add_action('show_user_profile', 'add_secondary_addresses');
add_action('edit_user_profile', 'add_secondary_addresses');

function add_secondary_addresses($user) {
    $uid = (int) $user->ID;
    ?>
    <h2>Customer Billing Address (Secondary)</h2>
    <table class="form-table">
        <tr>
            <th><label for="billing2_first_name">First Name</label></th>
            <td>
                <input type="text" name="billing2_first_name" id="billing2_first_name" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_first_name', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_last_name">Last Name</label></th>
            <td>
                <input type="text" name="billing2_last_name" id="billing2_last_name" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_last_name', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_company">Company</label></th>
            <td>
                <input type="text" name="billing2_company" id="billing2_company" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_company', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_address_1">Address Line 1</label></th>
            <td>
                <input type="text" name="billing2_address_1" id="billing2_address_1" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_address_1', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_address_2">Address Line 2</label></th>
            <td>
                <input type="text" name="billing2_address_2" id="billing2_address_2" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_address_2', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_city">City</label></th>
            <td>
                <input type="text" name="billing2_city" id="billing2_city" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_city', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_state">State</label></th>
            <td>
                <input type="text" name="billing2_state" id="billing2_state" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_state', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_postcode">Postcode</label></th>
            <td>
                <input type="text" name="billing2_postcode" id="billing2_postcode" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_postcode', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_country">Country</label></th>
            <td>
                <input type="text" name="billing2_country" id="billing2_country" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_country', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_phone">Phone</label></th>
            <td>
                <input type="text" name="billing2_phone" id="billing2_phone" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_phone', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_email">Email</label></th>
            <td>
                <input type="email" name="billing2_email" id="billing2_email" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_email', true)); ?>" />
            </td>
        </tr>
        <tr><th colspan="2"><strong>NDIS (Billing)</strong></th></tr>
        <tr>
            <th><label for="billing2_ndis_participant_name">NDIS Participant Name</label></th>
            <td>
                <input type="text" name="billing2_ndis_participant_name" id="billing2_ndis_participant_name" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_ndis_participant_name', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_ndis_number">NDIS Number</label></th>
            <td>
                <input type="text" name="billing2_ndis_number" id="billing2_ndis_number" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_ndis_number', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_ndis_dob">NDIS Date of Birth</label></th>
            <td>
                <input type="text" name="billing2_ndis_dob" id="billing2_ndis_dob" class="regular-text" placeholder="dd-mm-yyyy" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_ndis_dob', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_ndis_funding_type">NDIS Funding Type</label></th>
            <td>
                <input type="text" name="billing2_ndis_funding_type" id="billing2_ndis_funding_type" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_ndis_funding_type', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_ndis_invoice_email">NDIS Invoice Email</label></th>
            <td>
                <input type="email" name="billing2_ndis_invoice_email" id="billing2_ndis_invoice_email" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_ndis_invoice_email', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_ndis_approval">NDIS Approval</label></th>
            <td>
                <input type="checkbox" name="billing2_ndis_approval" id="billing2_ndis_approval" value="1" <?php checked(get_user_meta($uid, 'billing2_ndis_approval', true), '1'); ?> />
            </td>
        </tr>
        <tr><th colspan="2"><strong>HCP (Billing)</strong></th></tr>
        <tr>
            <th><label for="billing2_hcp_participant_name">HCP Participant Name</label></th>
            <td>
                <input type="text" name="billing2_hcp_participant_name" id="billing2_hcp_participant_name" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_hcp_participant_name', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_hcp_number">HCP Number</label></th>
            <td>
                <input type="text" name="billing2_hcp_number" id="billing2_hcp_number" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_hcp_number', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_hcp_provider_email">HCP Provider Email</label></th>
            <td>
                <input type="email" name="billing2_hcp_provider_email" id="billing2_hcp_provider_email" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'billing2_hcp_provider_email', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="billing2_hcp_approval">HCP Approval</label></th>
            <td>
                <input type="checkbox" name="billing2_hcp_approval" id="billing2_hcp_approval" value="1" <?php checked(get_user_meta($uid, 'billing2_hcp_approval', true), '1'); ?> />
            </td>
        </tr>
    </table>

    <h2>Customer Shipping Address (Secondary)</h2>
    <table class="form-table">
        <tr>
            <th><label for="shipping2_first_name">First Name</label></th>
            <td>
                <input type="text" name="shipping2_first_name" id="shipping2_first_name" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_first_name', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_last_name">Last Name</label></th>
            <td>
                <input type="text" name="shipping2_last_name" id="shipping2_last_name" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_last_name', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_company">Company</label></th>
            <td>
                <input type="text" name="shipping2_company" id="shipping2_company" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_company', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_address_1">Address Line 1</label></th>
            <td>
                <input type="text" name="shipping2_address_1" id="shipping2_address_1" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_address_1', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_address_2">Address Line 2</label></th>
            <td>
                <input type="text" name="shipping2_address_2" id="shipping2_address_2" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_address_2', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_city">City</label></th>
            <td>
                <input type="text" name="shipping2_city" id="shipping2_city" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_city', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_state">State</label></th>
            <td>
                <input type="text" name="shipping2_state" id="shipping2_state" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_state', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_postcode">Postcode</label></th>
            <td>
                <input type="text" name="shipping2_postcode" id="shipping2_postcode" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_postcode', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_country">Country</label></th>
            <td>
                <input type="text" name="shipping2_country" id="shipping2_country" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_country', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_phone">Phone</label></th>
            <td>
                <input type="text" name="shipping2_phone" id="shipping2_phone" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_phone', true)); ?>" />
            </td>
        </tr>
        <tr>
            <th><label for="shipping2_email">Email</label></th>
            <td>
                <input type="email" name="shipping2_email" id="shipping2_email" class="regular-text" value="<?php echo esc_attr(get_user_meta($uid, 'shipping2_email', true)); ?>" />
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
    $text_fields = [
        'billing2_first_name', 'billing2_last_name', 'billing2_company',
        'billing2_address_1', 'billing2_address_2', 'billing2_city', 'billing2_state', 'billing2_postcode', 'billing2_country',
        'billing2_phone', 'billing2_email',
        'billing2_ndis_participant_name', 'billing2_ndis_number', 'billing2_ndis_dob', 'billing2_ndis_funding_type', 'billing2_ndis_invoice_email',
        'billing2_hcp_participant_name', 'billing2_hcp_number', 'billing2_hcp_provider_email',
        'shipping2_first_name', 'shipping2_last_name', 'shipping2_company',
        'shipping2_address_1', 'shipping2_address_2', 'shipping2_city', 'shipping2_state', 'shipping2_postcode', 'shipping2_country',
        'shipping2_phone', 'shipping2_email',
    ];
    $checkbox_fields = [
        'billing2_ndis_approval', 'billing2_hcp_approval',
    ];
    foreach ($text_fields as $field) {
        if (isset($_POST[$field])) {
            update_user_meta($user_id, $field, sanitize_text_field($_POST[$field]));
        }
    }
    foreach ($checkbox_fields as $field) {
        update_user_meta($user_id, $field, isset($_POST[$field]) ? '1' : '0');
    }
}

// Load REST API for dashboard Addresses → Customer Billing/Shipping Address (Secondary)
require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';

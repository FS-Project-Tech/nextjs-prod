<?php
/**
 * Plugin Name:       Joya Typesense Woo
 * Plugin URI:        https://github.com/joya-medical/nextjs-prod
 * Description:       WooCommerce REST feed for Typesense, real-time sync to Next.js, manual sync in admin, and an activity log under WooCommerce.
 * Version:           1.2.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Joya Medical Supplies
 * License:           GPL-2.0-or-later
 * Text Domain:       joya-typesense-woo
 *
 * Install: copy this entire folder to wp-content/plugins/joya-typesense-woo/ and activate in wp-admin.
 *
 */

if (!defined('ABSPATH')) {
    exit;
}

if (defined('JOYA_TYPESENSE_WOO_PLUGIN_FILE')) {
    return;
}
define('JOYA_TYPESENSE_WOO_PLUGIN_FILE', __FILE__);
define('JOYA_TYPESENSE_WOO_VERSION', '1.2.0');

/**
 * Load sync core once WooCommerce is available (and avoid double-include with legacy require).
 */
function joya_typesense_woo_bootstrap(): void
{
    if (!class_exists('WooCommerce', false)) {
        add_action('admin_notices', static function (): void {
            if (!current_user_can('activate_plugins')) {
                return;
            }
            echo '<div class="notice notice-error"><p>';
            echo esc_html__('Joya Typesense Woo requires WooCommerce to be installed and active.', 'joya-typesense-woo');
            echo '</p></div>';
        });
        return;
    }

    if (defined('JOYA_TYPESENSE_WOO_SYNC_INCLUDED')) {
        return;
    }

    $sync = plugin_dir_path(__FILE__) . 'includes/joya-typesense-woo-sync.php';
    if (is_readable($sync)) {
        require_once $sync;
    }
}

add_action('plugins_loaded', 'joya_typesense_woo_bootstrap', 20);

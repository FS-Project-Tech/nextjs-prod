<?php
/**
 * Plugin Name:       Joya Typesense Woo
 * Plugin URI:        https://github.com/joya-medical/nextjs-prod
 * Description:       WooCommerce REST feed for Typesense, real-time sync to Next.js, manual sync in admin, and an activity log under WooCommerce.
 * Version:           1.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Joya Medical Supplies
 * License:           GPL-2.0-or-later
 * Text Domain:       joya-typesense-woo
 *
 * Install: copy this entire folder to wp-content/plugins/joya-typesense-woo/ and activate in wp-admin.
 *
 * Configure in wp-config.php with define() and/or server environment variables:
 * - TYPESENSE_SYNC_BASE_URL or JOYA_NEXT_API_BASE — your Next.js public URL (no trailing slash)
 * - TYPESENSE_SYNC_SECRET or SYNC_SECRET — Bearer token; must match Next.js TYPESENSE_SYNC_SECRET / SYNC_SECRET
 * - TYPESENSE_DELETE_SECRET — optional; Bearer for deletes (else SYNC_SECRET)
 * - TYPESENSE_FEED_SECRET — optional; locks GET /wp-json/custom/v1/typesense-products
 * - VERCEL_PROTECTION_BYPASS_SECRET — optional; same as Vercel “Protection Bypass for Automation” if POSTs get HTTP 429 + Security Checkpoint HTML
 * - JOYA_TYPESENSE_SYNC_LOG — optional true/1 to mirror debug lines to error_log
 *
 * WordPress does not load .env from Next — define these on the PHP host. Constants in wp-config.php are supported.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (defined('JOYA_TYPESENSE_WOO_PLUGIN_FILE')) {
    return;
}
define('JOYA_TYPESENSE_WOO_PLUGIN_FILE', __FILE__);
define('JOYA_TYPESENSE_WOO_VERSION', '1.1.0');

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

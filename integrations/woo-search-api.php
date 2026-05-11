<?php
/**
 * Legacy entrypoint for the Woo ↔ Typesense bridge.
 *
 * Prefer installing the WordPress plugin from:
 *   integrations/wordpress/plugins/joya-typesense-woo/
 * (copy to wp-content/plugins/joya-typesense-woo/ and activate "Joya Typesense Woo").
 *
 * If your deploy still `require`s this file from mu-plugins or a theme, this path continues
 * to load the shared implementation once.
 */

if (!defined('ABSPATH')) {
    exit;
}

$core = __DIR__ . '/wordpress/plugins/joya-typesense-woo/includes/joya-typesense-woo-sync.php';
if (is_readable($core)) {
    require_once $core;
}

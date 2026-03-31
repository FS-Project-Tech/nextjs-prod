<?php
/**
 * WordPress REST API: Headless Cart (per-user)
 *
 * Stores the headless app's cart in user meta so logged-in users see the
 * same cart across browsers/devices. Guest carts remain browser-only.
 *
 * Routes:
 *   GET  /wp-json/customers/v1/headless-cart   → { items: [...] } (empty if not logged in)
 *   POST /wp-json/customers/v1/headless-cart   → save { items: [...] } to user meta
 *
 * Authentication:
 * - The Next.js app sends "Authorization: Bearer <JWT>". Your JWT plugin must set
 *   the current user for REST so is_user_logged_in() is true.
 * - On Apache/Cloudways the server often STRIPS the Authorization header. Add to
 *   .htaccess in WordPress root (inside <IfModule mod_rewrite.c>, after RewriteEngine On):
 *     RewriteCond %{HTTP:Authorization} .
 *     RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
 *   See docs/JWT_WORDPRESS_SETUP.md.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function () {
    register_rest_route('customers/v1', '/headless-cart', array(
        array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => function () {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('items' => array()), 200);
                }
                $raw = get_user_meta($user_id, 'headless_cart_v1', true);
                if (empty($raw)) {
                    return new WP_REST_Response(array('items' => array()), 200);
                }
                $decoded = json_decode($raw, true);
                if (!is_array($decoded)) {
                    $decoded = array();
                }
                return new WP_REST_Response(array('items' => array_values($decoded)), 200);
            },
        ),
        array(
            'methods'             => 'POST',
            'permission_callback' => function () {
                return is_user_logged_in();
            },
            'callback'            => function ($request) {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('success' => false, 'error' => 'Not authenticated'), 401);
                }
                $body = $request->get_json_params();
                if (!is_array($body)) {
                    $body = array();
                }
                $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : array();
                // Basic sanitization: ensure a list of objects/arrays
                $sanitized = array();
                foreach ($items as $item) {
                    if (is_array($item) || is_object($item)) {
                        $sanitized[] = $item;
                    }
                }
                update_user_meta($user_id, 'headless_cart_v1', wp_json_encode($sanitized));
                return new WP_REST_Response(array('success' => true), 200);
            },
        ),
    ));
});


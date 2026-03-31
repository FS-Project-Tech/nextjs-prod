<?php
/**
 * WordPress REST API: Headless Wishlist (per-user)
 *
 * Stores the headless app's wishlist in user meta so logged-in users see the
 * same wishlist across browsers/devices. Guest wishlists remain browser-only.
 *
 * Routes:
 *   GET  /wp-json/custom/v1/wishlist          → { wishlist: [...] } (empty if not logged in)
 *   POST /wp-json/custom/v1/wishlist/add     → add product_id to wishlist
 *   POST /wp-json/custom/v1/wishlist/remove   → remove product_id from wishlist
 *
 * Authentication:
 * - The Next.js app sends "Authorization: Bearer <JWT>". Your JWT plugin must set
 *   the current user for REST so is_user_logged_in() is true.
 * - On Apache/Cloudways the server often STRIPS the Authorization header. Add to
 *   .htaccess in WordPress root (inside <IfModule mod_rewrite.c>, after RewriteEngine On):
 *     RewriteCond %{HTTP:Authorization} .
 *     RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
 *   See docs/JWT_WORDPRESS_SETUP.md. Same as for headless cart.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function () {
    // GET /wp-json/custom/v1/wishlist (same pattern as headless-cart GET)
    register_rest_route('custom/v1', '/wishlist', array(
        array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => function () {
                $user_id = get_current_user_id();
                if (!$user_id) {
                    return new WP_REST_Response(array('wishlist' => array()), 200);
                }
                $raw = get_user_meta($user_id, 'headless_wishlist_v1', true);
                if (empty($raw)) {
                    return new WP_REST_Response(array('wishlist' => array()), 200);
                }
                $decoded = json_decode($raw, true);
                if (!is_array($decoded)) {
                    $decoded = array();
                }
                $wishlist = array_values(array_unique(array_map('intval', array_filter($decoded, function ($id) {
                    return is_numeric($id) && (int) $id > 0;
                }))));
                return new WP_REST_Response(array('wishlist' => $wishlist), 200);
            },
        ),
    ));

    // POST /wp-json/custom/v1/wishlist/add (same pattern as headless-cart POST)
    register_rest_route('custom/v1', '/wishlist/add', array(
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
                $params = $request->get_json_params();
                if (empty($params)) {
                    $params = $request->get_body_params();
                }
                $product_id = isset($params['product_id']) ? (int) $params['product_id'] : 0;
                if ($product_id <= 0) {
                    return new WP_REST_Response(array('success' => false, 'error' => 'Invalid product ID'), 400);
                }
                $product = get_post($product_id);
                if (!$product || $product->post_type !== 'product') {
                    return new WP_REST_Response(array('success' => false, 'error' => 'Product not found'), 404);
                }
                $raw     = get_user_meta($user_id, 'headless_wishlist_v1', true);
                $decoded = $raw ? json_decode($raw, true) : array();
                if (!is_array($decoded)) {
                    $decoded = array();
                }
                $decoded[] = $product_id;
                $decoded   = array_values(array_unique(array_map('intval', $decoded)));
                update_user_meta($user_id, 'headless_wishlist_v1', wp_json_encode($decoded));
                return new WP_REST_Response(array('success' => true, 'wishlist' => $decoded, 'message' => 'Product added to wishlist'), 200);
            },
        ),
    ));

    // POST /wp-json/custom/v1/wishlist/remove
    register_rest_route('custom/v1', '/wishlist/remove', array(
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
                $params = $request->get_json_params();
                if (empty($params)) {
                    $params = $request->get_body_params();
                }
                $product_id = isset($params['product_id']) ? (int) $params['product_id'] : 0;
                if ($product_id <= 0) {
                    return new WP_REST_Response(array('success' => false, 'error' => 'Invalid product ID'), 400);
                }
                $raw     = get_user_meta($user_id, 'headless_wishlist_v1', true);
                $decoded = $raw ? json_decode($raw, true) : array();
                if (!is_array($decoded)) {
                    $decoded = array();
                }
                $updated = array_values(array_filter(array_map('intval', $decoded), function ($id) use ($product_id) {
                    return $id > 0 && $id !== $product_id;
                }));
                update_user_meta($user_id, 'headless_wishlist_v1', wp_json_encode($updated));
                return new WP_REST_Response(array('success' => true, 'wishlist' => $updated, 'message' => 'Product removed from wishlist'), 200);
            },
        ),
    ));
});

<?php
/**
 * Project-related code for Next.js headless WooCommerce
 *
 * Copy the sections you need into your theme's functions.php (or a custom plugin).
 * Requires: WordPress, WooCommerce, JWT Authentication for WP REST API.
 * Optional: ACF (for ACF sections), product_brand taxonomy (for brands).
 *
 * Dashboard addresses (secondary billing/shipping): see docs/SECONDARY-ADDRESSES-WORDPRESS-SETUP.md
 * and add wordpress-secondary-addresses-rest-api.php to your theme, then in functions.php:
 *   require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';
 *
 * Forgot password frontend URL: set NEXTJS_FRONTEND_URL in wp-config.php if not localhost:3000.
 *
 * @package YourTheme
 */

defined('ABSPATH') || exit;

// =============================================================================
// 1. CORS for Next.js (required for REST API + Authorization header)
// =============================================================================
add_action('rest_api_init', function () {
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
    add_filter('rest_pre_serve_request', function ($value) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        return $value;
    });
}, 15);

// =============================================================================
// 2. ACF: Expose product ACF fields + ACF options in REST (optional – requires ACF)
// =============================================================================
add_filter('acf/rest_api/product/get_fields', function ($data, $request, $post_id) {
    return $data;
}, 10, 3);

add_action('rest_api_init', function () {
    register_rest_field('product', 'acf_fields', array(
        'get_callback' => function ($object) {
            return function_exists('get_fields') ? get_fields($object['id']) : null;
        },
        'schema' => null,
    ));
});

add_action('rest_api_init', function () {
    register_rest_route('acf/v3/options', '/options', array(
        'methods'  => 'GET',
        'callback' => function () {
            $fields = function_exists('get_fields') ? get_fields('option') : array();
            return rest_ensure_response(array('acf' => $fields));
        },
        'permission_callback' => '__return_true',
    ));
});

// =============================================================================
// 3. Forgot & Reset Password (optional – set $frontend_url to your Next.js URL)
// =============================================================================
add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/forgot-password', array(
        'methods' => 'POST',
        'callback' => 'headless_handle_forgot_password',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('custom/v1', '/reset-password', array(
        'methods' => 'POST',
        'callback' => 'headless_handle_reset_password',
        'permission_callback' => '__return_true',
    ));
});

function headless_handle_forgot_password($request) {
    $email = sanitize_email($request->get_param('email'));
    if (empty($email) || !email_exists($email)) {
        return new WP_Error('invalid_email', 'Email not found', array('status' => 404));
    }
    $user = get_user_by('email', $email);
    $token = wp_generate_password(32, false);
    update_user_meta($user->ID, 'reset_password_token', $token);
    update_user_meta($user->ID, 'reset_password_expires', time() + 3600);
    $frontend_url = defined('NEXTJS_FRONTEND_URL') ? NEXTJS_FRONTEND_URL : 'http://localhost:3000';
    $reset_link = $frontend_url . '/auth/reset-password?token=' . $token;
    $subject = 'Password Reset Request';
    $message = "Hi {$user->user_login},\n\nClick below to reset your password:\n$reset_link\n\nExpires in 1 hour.";
    wp_mail($email, $subject, $message, array('Content-Type: text/plain; charset=UTF-8'));
    return array('success' => true, 'message' => 'Password reset link sent to your email.');
}

function headless_handle_reset_password($request) {
    $token = sanitize_text_field($request->get_param('token'));
    $new_password = sanitize_text_field($request->get_param('new_password'));
    if (empty($token) || empty($new_password)) {
        return new WP_Error('missing_params', 'Token and new password required', array('status' => 400));
    }
    $users = get_users(array(
        'meta_key'   => 'reset_password_token',
        'meta_value' => $token,
        'number'     => 1,
        'count_total' => false,
    ));
    if (empty($users)) {
        return new WP_Error('invalid_token', 'Invalid or expired reset token', array('status' => 400));
    }
    $user = $users[0];
    $expires = get_user_meta($user->ID, 'reset_password_expires', true);
    if (time() > (int) $expires) {
        return new WP_Error('expired', 'Reset token expired', array('status' => 400));
    }
    wp_set_password($new_password, $user->ID);
    delete_user_meta($user->ID, 'reset_password_token');
    delete_user_meta($user->ID, 'reset_password_expires');
    return array('success' => true, 'message' => 'Password reset successful.');
}

// =============================================================================
// 4. My Orders – custom/v1/my-orders + api/v1/my-orders (Next.js dashboard uses api/v1)
// =============================================================================
add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/my-orders', array(
        'methods' => 'GET',
        'callback' => 'headless_get_my_orders',
        'permission_callback' => function () {
            return is_user_logged_in();
        },
    ));
    register_rest_route('api/v1', '/my-orders', array(
        'methods' => 'GET',
        'callback' => 'headless_get_my_orders',
        'permission_callback' => function () {
            return is_user_logged_in();
        },
    ));
});

function headless_get_my_orders(WP_REST_Request $request) {
    $user_id = get_current_user_id();
    if (!$user_id) {
        return new WP_Error('unauthorized', 'You must be logged in.', array('status' => 403));
    }
    $per_page = $request->get_param('per_page') ? max(1, min(100, (int) $request->get_param('per_page'))) : -1;
    $page = max(1, (int) $request->get_param('page'));
    $orders = wc_get_orders(array(
        'customer_id' => $user_id,
        'limit'       => $per_page,
        'offset'      => $per_page > 0 ? ($page - 1) * $per_page : 0,
        'orderby'     => 'date',
        'order'       => 'DESC',
    ));
    if (empty($orders)) {
        return rest_ensure_response(array());
    }
    $data = array();
    foreach ($orders as $order) {
        $items = array();
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $items[] = array(
                'name'       => $item->get_name(),
                'quantity'   => $item->get_quantity(),
                'product_id' => $item->get_product_id(),
                'total'      => $item->get_total(),
                'sku'        => $product ? $product->get_sku() : '',
            );
        }
        $data[] = array(
            'id'           => $order->get_id(),
            'date_created' => $order->get_date_created() ? $order->get_date_created()->date_i18n('Y-m-d H:i:s') : '',
            'status'       => $order->get_status(),
            'total'        => $order->get_total(),
            'line_items'   => $items,
        );
    }
    return rest_ensure_response($data);
}

// =============================================================================
// 5. User REST fields (first_name, last_name, email) for wp/v2/users/me
// =============================================================================
add_action('rest_api_init', function () {
    register_rest_field('user', 'first_name', array(
        'get_callback' => function ($user) {
            return get_user_meta($user['id'], 'first_name', true);
        },
        'update_callback' => function ($value, $user, $attr) {
            update_user_meta($user->ID, 'first_name', sanitize_text_field($value));
        },
        'schema' => array(
            'description' => 'User first name',
            'type'        => 'string',
            'context'     => array('view', 'edit'),
        ),
    ));
    register_rest_field('user', 'last_name', array(
        'get_callback' => function ($user) {
            return get_user_meta($user['id'], 'last_name', true);
        },
        'update_callback' => function ($value, $user, $attr) {
            update_user_meta($user->ID, 'last_name', sanitize_text_field($value));
        },
        'schema' => array(
            'description' => 'User last name',
            'type'        => 'string',
            'context'     => array('view', 'edit'),
        ),
    ));
    register_rest_field('user', 'email', array(
        'get_callback' => function ($user) {
            $u = get_user_by('id', $user['id']);
            return $u ? $u->user_email : '';
        },
        'update_callback' => function ($value, $user, $attr) {
            wp_update_user(array('ID' => $user->ID, 'user_email' => sanitize_email($value)));
        },
        'schema' => array(
            'description' => 'User email address',
            'type'        => 'string',
            'context'     => array('view', 'edit'),
        ),
    ));
});

// =============================================================================
// 6. custom/v1 change-password (optional – dashboard uses custom-auth/v1 below)
// =============================================================================
add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/change-password', array(
        'methods'  => 'POST',
        'callback' => 'headless_custom_change_password',
        'permission_callback' => function () {
            return is_user_logged_in();
        },
    ));
});

function headless_custom_change_password(WP_REST_Request $request) {
    $params  = $request->get_json_params();
    $current = isset($params['current_password']) ? $params['current_password'] : '';
    $new     = isset($params['new_password']) ? $params['new_password'] : '';
    $confirm = isset($params['confirm_password']) ? $params['confirm_password'] : '';
    if (empty($new) || empty($confirm)) {
        return new WP_Error('missing', 'New password required', array('status' => 400));
    }
    if ($new !== $confirm) {
        return new WP_Error('mismatch', 'Passwords do not match', array('status' => 400));
    }
    $user_id = get_current_user_id();
    if (!$user_id) {
        return new WP_Error('unauthorized', 'User not authenticated', array('status' => 401));
    }
    $user = get_user_by('id', $user_id);
    if ($current && !wp_check_password($current, $user->user_pass, $user->ID)) {
        return new WP_Error('invalid', 'Current password incorrect', array('status' => 400));
    }
    wp_set_password($new, $user->ID);
    wp_clear_auth_cookie();
    clean_user_cache($user);
    return array(
        'success' => true,
        'message' => 'Password updated successfully. Please log in again.',
    );
}

// =============================================================================
// 7. Roles in REST + custom roles (health_professional, nurse, ndis_user)
// =============================================================================
add_filter('rest_prepare_user', function ($response, $user) {
    $response->data['roles'] = $user->roles;
    return $response;
}, 10, 2);

function headless_create_custom_user_roles() {
    if (!get_role('health_professional')) {
        add_role('health_professional', 'Health Professional', array('read' => true));
    }
    if (!get_role('nurse')) {
        add_role('nurse', 'Nurse', array('read' => true));
    }
    if (!get_role('ndis_user')) {
        add_role('ndis_user', 'NDIS User', array('read' => true));
    }
}
add_action('init', 'headless_create_custom_user_roles');

add_filter('show_password_fields', '__return_true');

// =============================================================================
// 8. Brands API (custom/v1/brands) + product_brand thumbnail in REST
// =============================================================================
add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/brands', array(
        'methods'  => 'GET',
        'callback' => 'headless_get_brands',
        'permission_callback' => '__return_true',
    ));
});

function headless_get_brands() {
    $cache_key = 'headless_brand_list';
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        return $cached;
    }
    $terms = get_terms(array(
        'taxonomy'   => 'product_brand',
        'hide_empty' => true,
        'number'     => 0,
    ));
    if (is_wp_error($terms)) {
        return array();
    }
    $brands = array();
    foreach ($terms as $term) {
        $thumbnail_id = get_term_meta($term->term_id, 'thumbnail_id', true);
        $logo = $thumbnail_id ? wp_get_attachment_url($thumbnail_id) : null;
        $brands[] = array(
            'id'          => $term->term_id,
            'name'        => $term->name,
            'slug'        => $term->slug,
            'description' => $term->description,
            'count'       => $term->count,
            'logo'        => $logo,
        );
    }
    set_transient($cache_key, $brands, 12 * HOUR_IN_SECONDS);
    return $brands;
}

add_action('rest_api_init', function () {
    register_rest_field('product_brand', 'thumbnail', array(
        'get_callback' => function ($term) {
            $thumbnail_id = get_term_meta($term['id'], 'thumbnail_id', true);
            return $thumbnail_id ? wp_get_attachment_url($thumbnail_id) : null;
        },
    ));
});

// =============================================================================
// 9. Product reviews: GET/POST custom/v1/products/{id}/reviews
// =============================================================================
add_action('rest_api_init', 'headless_register_review_routes');

function headless_register_review_routes() {
    register_rest_route('custom/v1', '/reviews-check', array(
        'methods' => 'GET',
        'callback' => 'headless_reviews_check',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('custom/v1', '/products/(?P<id>\d+)/reviews', array(
        'methods' => array('GET', 'POST'),
        'callback' => 'headless_products_reviews_handler',
        'permission_callback' => '__return_true',
        'args' => array(
            'id' => array(
                'required' => true,
                'validate_callback' => function ($param) {
                    return is_numeric($param) && (int) $param > 0;
                },
            ),
        ),
    ));
}

function headless_products_reviews_handler($request) {
    if ($request->get_method() === 'GET') {
        return headless_list_product_reviews($request);
    }
    return headless_create_product_review($request);
}

function headless_list_product_reviews($request) {
    $product_id = (int) $request['id'];
    $post = get_post($product_id);
    if (!$post || $post->post_type !== 'product') {
        return new WP_Error('invalid_product', 'Product not found.', array('status' => 404));
    }
    $per_page = isset($request['per_page']) ? max(1, min(100, (int) $request['per_page'])) : 10;
    $page = isset($request['page']) ? max(1, (int) $request['page']) : 1;
    $offset = ($page - 1) * $per_page;
    $comments = get_comments(array(
        'post_id' => $product_id,
        'status'  => 'approve',
        'number'  => $per_page,
        'offset'  => $offset,
        'orderby' => 'comment_date_gmt',
        'order'   => 'DESC',
    ));
    $list = array();
    foreach ($comments as $c) {
        $rating = (int) get_comment_meta($c->comment_ID, 'rating', true);
        if ($rating < 1) $rating = 5;
        if ($rating > 5) $rating = 5;
        $list[] = array(
            'id'             => (int) $c->comment_ID,
            'date_created'   => $c->comment_date_gmt,
            'reviewer'       => $c->comment_author,
            'reviewer_email' => $c->comment_author_email,
            'review'         => $c->comment_content,
            'rating'         => $rating,
            'verified'       => false,
        );
    }
    return new WP_REST_Response($list, 200);
}

function headless_reviews_check() {
    return new WP_REST_Response(array('ok' => true, 'message' => 'Product reviews endpoint is active'), 200);
}

function headless_create_product_review($request) {
    $product_id = (int) $request['id'];
    $params = $request->get_json_params();
    if (empty($params)) {
        $params = $request->get_body_params();
    }
    $reviewer = isset($params['reviewer']) ? sanitize_text_field($params['reviewer']) : '';
    $reviewer_email = isset($params['reviewer_email']) ? sanitize_email($params['reviewer_email']) : '';
    $review = isset($params['review']) ? wp_kses_post($params['review']) : '';
    $rating = isset($params['rating']) ? absint($params['rating']) : 5;
    if ($rating < 1) $rating = 1;
    if ($rating > 5) $rating = 5;
    if (empty($review)) {
        return new WP_Error('empty_review', 'Review text is required.', array('status' => 400));
    }
    $post = get_post($product_id);
    if (!$post || $post->post_type !== 'product') {
        return new WP_Error('invalid_product', 'Product not found.', array('status' => 404));
    }
    $comment_data = array(
        'comment_post_ID'      => $product_id,
        'comment_author'       => $reviewer ? $reviewer : 'Guest',
        'comment_author_email' => $reviewer_email ? $reviewer_email : 'guest@noreply.local',
        'comment_content'      => $review,
        'comment_type'         => 'review',
        'comment_approved'     => 0,
        'comment_parent'       => 0,
    );
    $comment_id = wp_insert_comment($comment_data);
    if (!$comment_id || is_wp_error($comment_id)) {
        return new WP_Error('create_failed', 'Could not create review.', array('status' => 500));
    }
    add_comment_meta($comment_id, 'rating', $rating);
    headless_update_product_rating_meta($product_id);
    $comment = get_comment($comment_id);
    $created = array(
        'id'             => (int) $comment->comment_ID,
        'date_created'   => $comment->comment_date_gmt,
        'reviewer'       => $comment->comment_author,
        'reviewer_email' => $comment->comment_author_email,
        'review'         => $comment->comment_content,
        'rating'         => (int) $rating,
        'verified'       => false,
    );
    return new WP_REST_Response($created, 201);
}

function headless_update_product_rating_meta($product_id) {
    $comments = get_comments(array(
        'post_id' => $product_id,
        'status'  => 'approve',
        'number'  => 0,
    ));
    $count = count($comments);
    $total = 0;
    foreach ($comments as $c) {
        $r = (int) get_comment_meta($c->comment_ID, 'rating', true);
        if ($r >= 1 && $r <= 5) {
            $total += $r;
        }
    }
    $average = $count > 0 ? round($total / $count, 2) : 0;
    update_post_meta($product_id, '_wc_review_count', $count);
    update_post_meta($product_id, '_wc_average_rating', (string) $average);
}

// =============================================================================
// 10. custom-auth/v1/change-password (used by Next.js dashboard Change password)
// =============================================================================
if (!function_exists('nextjs_wp_change_password_callback')) {
    function nextjs_wp_change_password_callback($request) {
        $user_id = get_current_user_id();
        if ($user_id === 0) {
            return new WP_Error('not_authenticated', 'You must be logged in to change your password.', array('status' => 401));
        }
        $params   = $request->get_json_params();
        $current  = isset($params['current_password']) ? $params['current_password'] : '';
        $new_pass = isset($params['new_password']) ? $params['new_password'] : '';
        if (empty($current) || empty($new_pass)) {
            return new WP_Error('missing_fields', 'Current password and new password are required.', array('status' => 400));
        }
        if (strlen($new_pass) < 6) {
            return new WP_Error('weak_password', 'New password must be at least 6 characters.', array('status' => 400));
        }
        $user = get_userdata($user_id);
        if (!$user) {
            return new WP_Error('invalid_user', 'User not found.', array('status' => 404));
        }
        if (!wp_check_password($current, $user->user_pass, $user_id)) {
            return new WP_Error('wrong_password', 'Current password is incorrect.', array('status' => 403));
        }
        wp_set_password($new_pass, $user_id);
        return array('message' => 'Password updated successfully.');
    }

    add_action('rest_api_init', function () {
        register_rest_route('custom-auth/v1', '/change-password', array(
            'methods' => 'POST',
            'callback' => 'nextjs_wp_change_password_callback',
            'permission_callback' => '__return_true',
            'args' => array(
                'current_password' => array(
                    'required' => true,
                    'type'     => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'new_password' => array(
                    'required' => true,
                    'type'     => 'string',
                ),
            ),
        ));
    });
}

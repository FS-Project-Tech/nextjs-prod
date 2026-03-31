<?php
/**
 * WordPress Custom REST API: Create Product Review
 *
 * Use this when WooCommerce REST API does not expose POST /wc/v3/products/{id}/reviews
 * (e.g. "No route was found matching the URL and request method").
 *
 * Install: Add this ENTIRE file to your ACTIVE theme's functions.php (or use as a plugin).
 * If you get a critical error: remove this block from functions.php, then add it again
 * one section at a time to find the line that causes the error.
 */

add_action('rest_api_init', 'custom_v1_register_review_routes');

function custom_v1_register_review_routes() {
    register_rest_route('custom/v1', '/reviews-check', array(
        'methods'             => 'GET',
        'callback'            => 'custom_v1_reviews_check',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('custom/v1', '/products/(?P<id>\d+)/reviews', array(
        'methods'             => array('GET', 'POST'),
        'callback'            => 'custom_v1_products_reviews_handler',
        'permission_callback' => '__return_true',
        'args'                => array(
            'id' => array(
                'required'          => true,
                'validate_callback' => 'custom_v1_validate_product_id',
            ),
        ),
    ));
}

function custom_v1_products_reviews_handler($request) {
    if ($request->get_method() === 'GET') {
        return custom_v1_list_product_reviews($request);
    }
    return custom_v1_create_product_review($request);
}

function custom_v1_list_product_reviews($request) {
    $product_id = (int) $request['id'];
    $post = get_post($product_id);
    if (!$post || $post->post_type !== 'product') {
        return new WP_Error('invalid_product', 'Product not found.', array('status' => 404));
    }
    $per_page = isset($request['per_page']) ? max(1, min(100, (int) $request['per_page'])) : 10;
    $page = isset($request['page']) ? max(1, (int) $request['page']) : 1;
    $offset = ($page - 1) * $per_page;

    // Fetch all approved comments for this product. Some WooCommerce setups
    // store reviews with empty comment_type, so we do not filter by "type".
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
        if ($rating < 1) {
            $rating = 5;
        }
        if ($rating > 5) {
            $rating = 5;
        }
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

function custom_v1_reviews_check() {
    return new WP_REST_Response(array('ok' => true, 'message' => 'Product reviews endpoint is active'), 200);
}

function custom_v1_validate_product_id($param) {
    return is_numeric($param) && (int) $param > 0;
}

if (!function_exists('custom_v1_create_product_review')) {
    function custom_v1_create_product_review($request) {
        $product_id = (int) $request['id'];
        $params = $request->get_json_params();
        if (empty($params)) {
            $params = $request->get_body_params();
        }

        $reviewer = isset($params['reviewer']) ? sanitize_text_field($params['reviewer']) : '';
        $reviewer_email = isset($params['reviewer_email']) ? sanitize_email($params['reviewer_email']) : '';
        $review = isset($params['review']) ? wp_kses_post($params['review']) : '';
        $rating = isset($params['rating']) ? absint($params['rating']) : 5;

        if ($rating < 1) {
            $rating = 1;
        }
        if ($rating > 5) {
            $rating = 5;
        }

        if (empty($review)) {
            return new WP_Error('empty_review', 'Review text is required.', array('status' => 400));
        }

        $post = get_post($product_id);
        if (!$post || $post->post_type !== 'product') {
            return new WP_Error('invalid_product', 'Product not found.', array('status' => 404));
        }

        // Create review as pending so it must be approved in WP admin
        // before appearing on the website.
        $comment_data = array(
            'comment_post_ID'      => $product_id,
            'comment_author'       => $reviewer ? $reviewer : 'Guest',
            'comment_author_email' => $reviewer_email ? $reviewer_email : 'guest@noreply.local',
            'comment_content'      => $review,
            'comment_type'         => 'review',
            'comment_approved'     => 0, // 0 / 'hold' = pending moderation
            'comment_parent'       => 0,
        );

        $comment_id = wp_insert_comment($comment_data);
        if (!$comment_id || is_wp_error($comment_id)) {
            return new WP_Error('create_failed', 'Could not create review.', array('status' => 500));
        }

        add_comment_meta($comment_id, 'rating', $rating);

        custom_v1_update_product_rating_meta($product_id);

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
}

function custom_v1_update_product_rating_meta($product_id) {
    // Use all approved comments for this product (same logic as list endpoint)
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

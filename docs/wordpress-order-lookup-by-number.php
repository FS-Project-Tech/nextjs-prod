<?php
/**
 * WordPress: Order Lookup by Order Number (REST API)
 *
 * Use when WooCommerce uses Sequential Order Numbers (or similar) and the
 * REST API search doesn't find orders by order number.
 *
 * Add this to your theme's functions.php or a custom plugin.
 *
 * Endpoint: GET /wp-json/custom/v1/order-by-number/{order_number}
 * Returns: { "post_id": 269505 } or 404
 */

add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/order-by-number/(?P<order_number>[0-9]+)', array(
        'methods' => 'GET',
        'callback' => 'get_order_post_id_by_number',
        'permission_callback' => '__return_true',
        'args' => array(
            'order_number' => array(
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => 'absint',
            ),
        ),
    ));
});

function get_order_post_id_by_number($request) {
    $order_number = $request->get_param('order_number');
    if (empty($order_number)) {
        return new WP_Error('invalid', 'Order number is required', array('status' => 400));
    }

    // Sequential Order Numbers plugin: _order_number meta
    // WooCommerce Sequential Order Numbers Pro: _order_number
    // Other plugins may use different meta keys
    $meta_keys = array('_order_number', '_wc_order_number', 'order_number');

    foreach ($meta_keys as $meta_key) {
        $orders = get_posts(array(
            'post_type' => 'shop_order',
            'post_status' => 'any',
            'posts_per_page' => 1,
            'meta_query' => array(
                array(
                    'key' => $meta_key,
                    'value' => $order_number,
                    'compare' => '=',
                ),
            ),
            'fields' => 'ids',
        ));

        if (!empty($orders)) {
            return rest_ensure_response(array(
                'post_id' => (int) $orders[0],
                'order_number' => $order_number,
            ));
        }
    }

    return new WP_Error('not_found', 'Order not found', array('status' => 404));
}

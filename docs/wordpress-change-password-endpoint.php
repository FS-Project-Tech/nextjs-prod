<?php
/**
 * WordPress: Change password REST endpoint
 *
 * Required for "Change password" on the My Account page to work.
 * The Next.js app calls: POST /wp-json/custom-auth/v1/change-password
 *
 * Add this to your theme's functions.php or a custom plugin.
 * Requires: JWT Authentication for WP REST API (or similar) so the request
 * is authenticated and get_current_user_id() returns the logged-in user.
 *
 * If you get a "critical error" after adding this: remove it from functions.php,
 * then add it again using the updated code (unique function name + guard).
 */

if (!function_exists('nextjs_wp_change_password_callback')) {
    /**
     * Change password: verify current password, then set new one.
     */
    function nextjs_wp_change_password_callback($request) {
    $user_id = get_current_user_id();
    if ($user_id === 0) {
        return new WP_Error(
            'not_authenticated',
            'You must be logged in to change your password.',
            array('status' => 401)
        );
    }

    $params   = $request->get_json_params();
    $current  = $params['current_password'] ?? '';
    $new_pass = $params['new_password'] ?? '';

    if (empty($current) || empty($new_pass)) {
        return new WP_Error(
            'missing_fields',
            'Current password and new password are required.',
            array('status' => 400)
        );
    }

    if (strlen($new_pass) < 6) {
        return new WP_Error(
            'weak_password',
            'New password must be at least 6 characters.',
            array('status' => 400)
        );
    }

    $user = get_userdata($user_id);
    if (!$user) {
        return new WP_Error('invalid_user', 'User not found.', array('status' => 404));
    }

    if (!wp_check_password($current, $user->user_pass, $user_id)) {
        return new WP_Error(
            'wrong_password',
            'Current password is incorrect.',
            array('status' => 403)
        );
    }

    wp_set_password($new_pass, $user_id);

    // Optional: log the user out everywhere except this session by invalidating other sessions
    // wp_clear_auth_cookie() is not needed here; the JWT remains valid until expiry.

    return array('message' => 'Password updated successfully.');
    }

    add_action('rest_api_init', function () {
        register_rest_route('custom-auth/v1', '/change-password', array(
            'methods'             => 'POST',
            'callback'            => 'nextjs_wp_change_password_callback',
            'permission_callback' => '__return_true',
            'args'                => array(
                'current_password' => array(
                    'required'          => true,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'new_password' => array(
                    'required'          => true,
                    'type'              => 'string',
                ),
            ),
        ));
    });
}

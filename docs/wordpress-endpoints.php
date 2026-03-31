<?php
/**
 * WordPress Custom REST API Endpoints
 * 
 * Add this code to your theme's functions.php or a custom plugin
 * 
 * Required: JWT Authentication for WP REST API plugin
 * https://wordpress.org/plugins/jwt-authentication-for-wp-rest-api/
 */

/**
 * Register custom REST API routes
 */
add_action('rest_api_init', function () {
    // Register endpoint
    register_rest_route('custom/v1', '/register', array(
        'methods' => 'POST',
        'callback' => 'custom_user_register',
        'permission_callback' => '__return_true', // Public endpoint
    ));

    // Forgot password endpoint
    register_rest_route('custom/v1', '/forgot-password', array(
        'methods' => 'POST',
        'callback' => 'custom_forgot_password',
        'permission_callback' => '__return_true',
    ));

    // Reset password endpoint
    register_rest_route('custom/v1', '/reset-password', array(
        'methods' => 'POST',
        'callback' => 'custom_reset_password',
        'permission_callback' => '__return_true',
    ));
});

/**
 * Custom user registration
 */
function custom_user_register($request) {
    $params = $request->get_json_params();
    
    // Sanitize input
    $email = sanitize_email($params['email'] ?? '');
    $username = sanitize_user($params['username'] ?? $email);
    $password = $params['password'] ?? '';
    $first_name = sanitize_text_field($params['first_name'] ?? '');
    $last_name = sanitize_text_field($params['last_name'] ?? '');

    // Validate
    if (empty($email) || !is_email($email)) {
        return new WP_Error('invalid_email', 'Invalid email address', array('status' => 400));
    }

    if (empty($password) || strlen($password) < 6) {
        return new WP_Error('weak_password', 'Password must be at least 6 characters', array('status' => 400));
    }

    // Check if user exists
    if (email_exists($email)) {
        return new WP_Error('email_exists', 'An account with this email already exists', array('status' => 409));
    }

    if (username_exists($username)) {
        return new WP_Error('username_exists', 'This username is already taken', array('status' => 409));
    }

    // Create user
    $user_id = wp_create_user($username, $password, $email);

    if (is_wp_error($user_id)) {
        return $user_id;
    }

    // Update user meta
    if (!empty($first_name)) {
        update_user_meta($user_id, 'first_name', $first_name);
    }
    if (!empty($last_name)) {
        update_user_meta($user_id, 'last_name', $last_name);
    }

    // Set default role
    $user = new WP_User($user_id);
    $user->set_role('customer');

    // Generate JWT token for auto-login
    $token = apply_filters('jwt_auth_token_before_dispatch', null, $user);

    return array(
        'user' => array(
            'id' => $user_id,
            'email' => $email,
            'name' => trim($first_name . ' ' . $last_name) ?: $username,
            'username' => $username,
            'roles' => $user->roles,
        ),
        'token' => $token,
        'message' => 'Registration successful',
    );
}

/**
 * Forgot password - send reset link
 */
function custom_forgot_password($request) {
    $params = $request->get_json_params();
    $email = sanitize_email($params['email'] ?? '');

    if (empty($email) || !is_email($email)) {
        // Always return success (security: don't reveal if email exists)
        return array('message' => 'If an account exists with this email, a password reset link has been sent.');
    }

    $user = get_user_by('email', $email);
    if (!$user) {
        // Still return success for security
        return array('message' => 'If an account exists with this email, a password reset link has been sent.');
    }

    // Generate reset key
    $key = get_password_reset_key($user);
    if (is_wp_error($key)) {
        return array('message' => 'If an account exists with this email, a password reset link has been sent.');
    }

    // Build reset URL
    $reset_url = add_query_arg(array(
        'action' => 'rp',
        'key' => $key,
        'login' => rawurlencode($user->user_login),
    ), wp_lostpassword_url());

    // Alternative: Custom reset URL for Next.js
    $site_url = get_site_url();
    $nextjs_reset_url = $site_url . '/reset?token=' . urlencode($key) . '&email=' . urlencode($email);

    // Send email
    $subject = 'Password Reset Request';
    $message = "Hello,\n\n";
    $message .= "You requested to reset your password. Click the link below to reset it:\n\n";
    $message .= $nextjs_reset_url . "\n\n";
    $message .= "If you didn't request this, please ignore this email.\n\n";
    $message .= "This link will expire in 24 hours.";

    wp_mail($email, $subject, $message);

    return array('message' => 'If an account exists with this email, a password reset link has been sent.');
}

/**
 * Reset password with token
 */
function custom_reset_password($request) {
    $params = $request->get_json_params();
    $token = sanitize_text_field($params['token'] ?? '');
    $email = sanitize_email($params['email'] ?? '');
    $password = $params['password'] ?? '';

    if (empty($token) || empty($email) || empty($password)) {
        return new WP_Error('missing_fields', 'Token, email, and password are required', array('status' => 400));
    }

    if (strlen($password) < 6) {
        return new WP_Error('weak_password', 'Password must be at least 6 characters', array('status' => 400));
    }

    $user = get_user_by('email', $email);
    if (!$user) {
        return new WP_Error('invalid_user', 'Invalid email address', array('status' => 404));
    }

    // Verify reset key
    $check = check_password_reset_key($token, $user->user_login);
    if (is_wp_error($check)) {
        return new WP_Error('invalid_token', 'Invalid or expired reset token', array('status' => 400));
    }

    // Reset password
    reset_password($user, $password);

    return array('message' => 'Password has been reset successfully');
}


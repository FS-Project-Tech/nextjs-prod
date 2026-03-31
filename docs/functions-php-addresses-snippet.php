<?php
/**
 * Add this to your theme's functions.php so addresses from the Next.js app
 * are saved in WordPress and show in Edit User (Customer billing/shipping)
 * and in your DB (billing_first_name, billing_last_name, etc.).
 *
 * 1. Copy wordpress-secondary-addresses-rest-api.php into your theme folder
 *    (same folder as functions.php).
 * 2. Paste the code below at the end of functions.php.
 */

defined('ABSPATH') || exit;

// Load the REST API that receives address saves from the headless app.
// Saves to billing2_* / shipping2_* and also to primary billing_* / shipping_*.
require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';

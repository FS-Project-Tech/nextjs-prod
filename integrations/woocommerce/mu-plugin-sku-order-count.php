<?php
/**
 * Plugin Name: Joya SKU Order Count
 * Description: Tracks per-SKU order count for simple/variation products, includes admin column and reset/rebuild backfill tools.
 * Version: 1.0.0
 * Author: Joya
 *
 * Standard plugin install:
 * - Place this file in wp-content/plugins/joya-sku-order-count/joya-sku-order-count.php
 * - Activate from WP Admin -> Plugins
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Prevent duplicate hook registration if this file is loaded more than once
 * (for example, copied in both mu-plugins and plugins).
 */
if (defined('JOYA_SKU_ORDER_COUNT_BOOTSTRAPPED')) {
    return;
}
define('JOYA_SKU_ORDER_COUNT_BOOTSTRAPPED', true);

function joya_sku_wc_available(): bool
{
    return function_exists('wc_get_order') && class_exists('WooCommerce');
}

if (!defined('JOYA_SKU_ORDER_META_KEY')) {
    define('JOYA_SKU_ORDER_META_KEY', 'sku_order_count');
}
if (!defined('JOYA_SKU_ORDER_FLAG_META_KEY')) {
    define('JOYA_SKU_ORDER_FLAG_META_KEY', '_sku_counted');
}

/**
 * Count mode:
 * - 'orders' => +1 once per order per SKU
 * - 'qty'    => +ordered quantity per SKU
 */
if (!defined('JOYA_SKU_COUNT_MODE')) {
    define('JOYA_SKU_COUNT_MODE', 'orders');
}

/**
 * When variation is ordered, also increment parent product counter.
 */
if (!defined('JOYA_SKU_COUNT_VARIATION_PARENT')) {
    define('JOYA_SKU_COUNT_VARIATION_PARENT', true);
}

/**
 * Keep live + backfill statuses aligned to avoid mismatch.
 */
if (!defined('JOYA_SKU_LIVE_STATUSES')) {
    define('JOYA_SKU_LIVE_STATUSES', 'pending,on-hold,processing,completed,cancelled,refunded,failed'); // comma-separated
}
if (!defined('JOYA_SKU_BACKFILL_STATUSES')) {
    define('JOYA_SKU_BACKFILL_STATUSES', 'wc-pending,wc-on-hold,wc-processing,wc-completed,wc-cancelled,wc-refunded,wc-failed'); // comma-separated
}

if (!defined('JOYA_SKU_BACKFILL_PER_PAGE')) {
    define('JOYA_SKU_BACKFILL_PER_PAGE', 150);
}
if (!defined('JOYA_SKU_LOG_SOURCE')) {
    define('JOYA_SKU_LOG_SOURCE', 'joya-sku-order-count');
}
if (!defined('JOYA_SKU_LOG_DEBUG')) {
    define('JOYA_SKU_LOG_DEBUG', false);
}

function joya_sku_statuses_from_csv(string $csv): array
{
    $out = [];
    foreach (explode(',', $csv) as $part) {
        $s = trim($part);
        if ($s !== '') {
            $out[] = $s;
        }
    }
    return $out;
}

/**
 * WooCommerce logger wrapper.
 * Levels: emergency|alert|critical|error|warning|notice|info|debug
 *
 * @param array<string, mixed> $context
 */
function joya_sku_log(string $level, string $message, array $context = []): void
{
    if (!function_exists('wc_get_logger')) {
        return;
    }
    $suffix = $context !== [] ? ' | ' . wp_json_encode($context, JSON_UNESCAPED_SLASHES) : '';
    wc_get_logger()->log($level, $message . $suffix, ['source' => JOYA_SKU_LOG_SOURCE]);
}

function joya_sku_get_live_statuses(): array
{
    return joya_sku_statuses_from_csv(JOYA_SKU_LIVE_STATUSES);
}

function joya_sku_get_backfill_statuses(): array
{
    return joya_sku_statuses_from_csv(JOYA_SKU_BACKFILL_STATUSES);
}

/**
 * Capability used for UI + backfill actions.
 * Falls back to manage_options for stores where manage_woocommerce is removed from admin role.
 */
function joya_sku_required_capability(): string
{
    if (current_user_can('manage_woocommerce')) {
        return 'manage_woocommerce';
    }
    return 'manage_options';
}

function joya_sku_is_qty_mode(): bool
{
    return strtolower((string) JOYA_SKU_COUNT_MODE) === 'qty';
}

function joya_sku_increment_count(int $product_id, int $inc): void
{
    if ($product_id <= 0 || $inc <= 0) {
        return;
    }
    $current = (int) get_post_meta($product_id, JOYA_SKU_ORDER_META_KEY, true);
    $next = $current + $inc;
    update_post_meta($product_id, JOYA_SKU_ORDER_META_KEY, $next);
    if (JOYA_SKU_LOG_DEBUG) {
        joya_sku_log('debug', 'increment', [
            'product_id' => $product_id,
            'inc' => $inc,
            'from' => $current,
            'to' => $next,
            'mode' => JOYA_SKU_COUNT_MODE,
        ]);
    }
}

/**
 * Process one order once.
 */
function joya_sku_process_order(WC_Order $order): void
{
    $order_id = (int) $order->get_id();
    if ($order_id <= 0) {
        return;
    }
    joya_sku_log('info', 'process_order.start', ['order_id' => $order_id]);

    if (get_post_meta($order_id, JOYA_SKU_ORDER_FLAG_META_KEY, true)) {
        if (JOYA_SKU_LOG_DEBUG) {
            joya_sku_log('debug', 'process_order.skip_already_counted', ['order_id' => $order_id]);
        }
        return;
    }

    $seen = [];
    $qty_mode = joya_sku_is_qty_mode();

    foreach ($order->get_items('line_item') as $item) {
        if (!$item instanceof WC_Order_Item_Product) {
            continue;
        }

        $product = $item->get_product();
        if (!$product) {
            continue;
        }

        $qty = max(1, (int) $item->get_quantity());

        if ($product->is_type('variation')) {
            $variation_id = (int) $product->get_id();
            $parent_id = (int) $product->get_parent_id();

            if ($variation_id > 0) {
                if ($qty_mode) {
                    joya_sku_increment_count($variation_id, $qty);
                } else {
                    $k = 'var_' . $variation_id;
                    if (!isset($seen[$k])) {
                        joya_sku_increment_count($variation_id, 1);
                        $seen[$k] = true;
                    }
                }
            }

            if (JOYA_SKU_COUNT_VARIATION_PARENT && $parent_id > 0) {
                if ($qty_mode) {
                    joya_sku_increment_count($parent_id, $qty);
                } else {
                    $k = 'parent_' . $parent_id;
                    if (!isset($seen[$k])) {
                        joya_sku_increment_count($parent_id, 1);
                        $seen[$k] = true;
                    }
                }
            }
        } else {
            $product_id = (int) $product->get_id();
            if ($product_id <= 0) {
                continue;
            }

            if ($qty_mode) {
                joya_sku_increment_count($product_id, $qty);
            } else {
                $k = 'simple_' . $product_id;
                if (!isset($seen[$k])) {
                    joya_sku_increment_count($product_id, 1);
                    $seen[$k] = true;
                }
            }
        }
    }

    update_post_meta($order_id, JOYA_SKU_ORDER_FLAG_META_KEY, 1);
    joya_sku_log('info', 'process_order.done', ['order_id' => $order_id]);
}

function joya_sku_count_live_order(int $order_id): void
{
    $order = wc_get_order($order_id);
    if (!$order instanceof WC_Order) {
        return;
    }
    joya_sku_process_order($order);
}

/**
 * Register order status hooks from configured statuses.
 */
add_action('init', static function () {
    static $registered = false;
    if ($registered) {
        return;
    }
    if (!joya_sku_wc_available()) {
        return;
    }
    $registered = true;

    foreach (joya_sku_get_live_statuses() as $status) {
        add_action('woocommerce_order_status_' . $status, 'joya_sku_count_live_order', 10, 1);
    }
}, 1);

/**
 * Backfill runner (safe admin-only).
 * Query args:
 * - joya_sku_backfill=1
 * - backfill_page=1
 * - reset=1 (optional; clears counters + flags first on page 1)
 * - _wpnonce=<nonce>
 */
add_action('admin_init', static function () {
    if (!isset($_GET['joya_sku_backfill'])) {
        return;
    }
    if (!joya_sku_wc_available()) {
        wp_die('WooCommerce is required for SKU Order Count.', 400);
    }
    if (!current_user_can(joya_sku_required_capability())) {
        wp_die('Insufficient permission.', 403);
    }

    $nonce = isset($_GET['_wpnonce']) ? sanitize_text_field(wp_unslash($_GET['_wpnonce'])) : '';
    if (!$nonce || !wp_verify_nonce($nonce, 'joya_sku_backfill_run')) {
        wp_die('Invalid nonce.', 403);
    }

    @set_time_limit(0);
    nocache_headers();
    echo '<div style="font-family:Arial,sans-serif;padding:16px">';

    $page = isset($_GET['backfill_page']) ? max(1, (int) $_GET['backfill_page']) : 1;
    $per_page = max(1, (int) JOYA_SKU_BACKFILL_PER_PAGE);
    $do_reset = isset($_GET['reset']) && (int) $_GET['reset'] === 1;

    if ($do_reset && $page === 1) {
        echo '<h3>Resetting counters...</h3>';

        $product_ids = get_posts([
            'post_type' => ['product', 'product_variation'],
            'post_status' => 'any',
            'posts_per_page' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
        ]);
        $product_resets = 0;
        foreach ($product_ids as $pid) {
            delete_post_meta((int) $pid, JOYA_SKU_ORDER_META_KEY);
            $product_resets++;
        }

        $order_ids = wc_get_orders([
            'limit' => -1,
            'status' => joya_sku_get_backfill_statuses(),
            'return' => 'ids',
        ]);
        $flag_resets = 0;
        foreach ($order_ids as $oid) {
            delete_post_meta((int) $oid, JOYA_SKU_ORDER_FLAG_META_KEY);
            $flag_resets++;
        }

        echo '<p>Products/variations reset: <strong>' . esc_html((string) $product_resets) . '</strong></p>';
        echo '<p>Order flags reset: <strong>' . esc_html((string) $flag_resets) . '</strong></p>';
        echo '<hr />';
        joya_sku_log('notice', 'backfill.reset_done', [
            'products_reset' => $product_resets,
            'flags_reset' => $flag_resets,
        ]);
    }

    echo '<h3>Backfill page ' . esc_html((string) $page) . '</h3>';

    $orders = wc_get_orders([
        'limit' => $per_page,
        'paged' => $page,
        'status' => joya_sku_get_backfill_statuses(),
        'return' => 'objects',
    ]);

    if (empty($orders)) {
        joya_sku_log('notice', 'backfill.completed', ['last_page' => $page]);
        echo '<p><strong>Done.</strong> Backfill completed.</p></div>';
        exit;
    }

    $processed = 0;
    foreach ($orders as $order) {
        if (!$order instanceof WC_Order) {
            continue;
        }
        $oid = (int) $order->get_id();
        if ($oid <= 0) {
            continue;
        }
        if (get_post_meta($oid, JOYA_SKU_ORDER_FLAG_META_KEY, true)) {
            continue;
        }
        joya_sku_process_order($order);
        $processed++;
    }

    echo '<p>Orders processed this page: <strong>' . esc_html((string) $processed) . '</strong></p>';
    joya_sku_log('info', 'backfill.page_done', [
        'page' => $page,
        'processed' => $processed,
        'per_page' => $per_page,
    ]);

    $next_url = add_query_arg([
        'joya_sku_backfill' => 1,
        'backfill_page' => $page + 1,
        '_wpnonce' => $nonce,
    ], admin_url('admin.php?page=joya-sku-order-count'));

    echo '<p>Moving to next page...</p>';
    echo '<script>setTimeout(function(){window.location.href=' . wp_json_encode($next_url) . ';},350);</script>';
    echo '</div>';
    exit;
});

/**
 * Tools page UI
 */
add_action('admin_menu', static function () {
    if (!joya_sku_wc_available()) {
        return;
    }
    add_submenu_page(
        'woocommerce',
        'SKU Order Count',
        'SKU Order Count',
        joya_sku_required_capability(),
        'joya-sku-order-count',
        'joya_sku_render_tools_page'
    );
});

function joya_sku_render_tools_page(): void
{
    if (!current_user_can(joya_sku_required_capability())) {
        wp_die('Insufficient permission.');
    }

    $nonce = wp_create_nonce('joya_sku_backfill_run');
    $run_url = add_query_arg([
        'joya_sku_backfill' => 1,
        'backfill_page' => 1,
        '_wpnonce' => $nonce,
    ], admin_url('admin.php?page=joya-sku-order-count'));
    $reset_run_url = add_query_arg([
        'joya_sku_backfill' => 1,
        'reset' => 1,
        'backfill_page' => 1,
        '_wpnonce' => $nonce,
    ], admin_url('admin.php?page=joya-sku-order-count'));

    echo '<div class="wrap">';
    echo '<h1>Joya SKU Order Count</h1>';
    echo '<p><strong>Mode:</strong> ' . esc_html(JOYA_SKU_COUNT_MODE) . '</p>';
    echo '<p><strong>Live statuses:</strong> ' . esc_html(JOYA_SKU_LIVE_STATUSES) . '</p>';
    echo '<p><strong>Backfill statuses:</strong> ' . esc_html(JOYA_SKU_BACKFILL_STATUSES) . '</p>';
    echo '<p><a class="button button-primary" href="' . esc_url($run_url) . '">Run Backfill (No Reset)</a></p>';
    echo '<p><a class="button button-secondary" href="' . esc_url($reset_run_url) . '" onclick="return confirm(\'Reset all sku_order_count data and rebuild now?\');">Reset + Rebuild</a></p>';
    echo '<p style="max-width:760px;color:#555">Use <em>Reset + Rebuild</em> after changing mode (orders vs qty). The process runs page-by-page and auto-continues.</p>';
    echo '</div>';
}

/**
 * Product edit field (simple product)
 */
add_action('woocommerce_product_options_general_product_data', static function () {
    woocommerce_wp_text_input([
        'id' => JOYA_SKU_ORDER_META_KEY,
        'label' => 'SKU Order Count',
        'desc_tip' => true,
        'description' => 'Auto-calculated sales count',
        'type' => 'number',
        'custom_attributes' => ['readonly' => 'readonly'],
    ]);
});

/**
 * Optional manual save compatibility.
 */
add_action('woocommerce_process_product_meta', static function ($post_id) {
    if (isset($_POST[JOYA_SKU_ORDER_META_KEY])) {
        update_post_meta((int) $post_id, JOYA_SKU_ORDER_META_KEY, (int) $_POST[JOYA_SKU_ORDER_META_KEY]);
    }
});

/**
 * Variation edit field
 */
add_action('woocommerce_variation_options_pricing', static function ($loop, $variation_data, $variation) {
    $value = get_post_meta((int) $variation->ID, JOYA_SKU_ORDER_META_KEY, true);
    woocommerce_wp_text_input([
        'id' => JOYA_SKU_ORDER_META_KEY . '[' . $loop . ']',
        'label' => 'SKU Sales Count',
        'value' => $value,
        'custom_attributes' => ['readonly' => 'readonly'],
    ]);
}, 10, 3);

/**
 * Admin product list column
 */
add_filter('manage_edit-product_columns', static function ($columns) {
    $columns[JOYA_SKU_ORDER_META_KEY] = 'Orders (SKU)';
    return $columns;
});

add_action('manage_product_posts_custom_column', static function ($column, $post_id) {
    if ($column !== JOYA_SKU_ORDER_META_KEY) {
        return;
    }

    $product = wc_get_product($post_id);
    if (!$product) {
        echo '—';
        return;
    }

    $count = 0;
    if ($product->is_type('variable')) {
        foreach ($product->get_children() as $child_id) {
            $count += (int) get_post_meta((int) $child_id, JOYA_SKU_ORDER_META_KEY, true);
        }
    } else {
        $count = (int) get_post_meta((int) $post_id, JOYA_SKU_ORDER_META_KEY, true);
    }

    if ($count > 0) {
        echo '<span style="display:inline-block;padding:4px 10px;background:#2271b1;color:#fff;border-radius:12px;font-size:12px;font-weight:600;">' . esc_html((string) $count) . '</span>';
    } else {
        echo '<span style="color:#999;font-size:12px;">—</span>';
    }
}, 10, 2);

add_filter('manage_edit-product_sortable_columns', static function ($columns) {
    $columns[JOYA_SKU_ORDER_META_KEY] = JOYA_SKU_ORDER_META_KEY;
    return $columns;
});

add_action('pre_get_posts', static function ($query) {
    if (!is_admin() || !$query->is_main_query()) {
        return;
    }
    if ($query->get('orderby') === JOYA_SKU_ORDER_META_KEY) {
        $query->set('meta_key', JOYA_SKU_ORDER_META_KEY);
        $query->set('orderby', 'meta_value_num');
    }
});

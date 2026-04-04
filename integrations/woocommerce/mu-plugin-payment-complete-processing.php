<?php
/**
 * Plugin Name: Joya — Payment complete → processing (server-side)
 * Description: Ensures WooCommerce orders reach "processing" after successful payment using core hooks only. Logs via WC logger. Drop into wp-content/mu-plugins/ (or load from theme — MU recommended).
 * Version: 1.0.0
 *
 * Security:
 * - Runs only inside WordPress/WooCommerce request lifecycle (no frontend/API surface added).
 * - Never trusts query params or external input; only validated WC_Order objects from hooks.
 *
 * Flow:
 * - Gateways that correctly call WC_Order::payment_complete() fire woocommerce_payment_complete after status is set.
 * - We log every completion and defensively correct rare cases where status stayed pending/on-hold.
 * - woocommerce_order_status_pending_to_processing provides an audit log when the transition occurs (any code path).
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('wc_get_order')) {
    return;
}

/** Log channel name in WooCommerce → Status → Logs */
if (!defined('JOYA_PAYMENT_PROCESSING_LOG_SOURCE')) {
    define('JOYA_PAYMENT_PROCESSING_LOG_SOURCE', 'joya-payment-processing');
}

/**
 * @param string               $level   emergency|alert|critical|error|warning|notice|info|debug
 * @param string               $message
 * @param array<string, mixed> $context
 */
function joya_payment_processing_log(string $level, string $message, array $context = []): void
{
    if (!function_exists('wc_get_logger')) {
        return;
    }

    $suffix = $context !== [] ? ' | ' . wp_json_encode($context, JSON_UNESCAPED_SLASHES) : '';
    wc_get_logger()->log(
        $level,
        $message . $suffix,
        ['source' => JOYA_PAYMENT_PROCESSING_LOG_SOURCE]
    );
}

/**
 * Resolve order from hook argument (ID or object).
 *
 * @param int|WC_Order $order_id_or_order
 */
function joya_payment_processing_get_order($order_id_or_order): ?WC_Order
{
    if ($order_id_or_order instanceof WC_Order) {
        return $order_id_or_order->get_id() ? $order_id_or_order : null;
    }

    if (!is_numeric($order_id_or_order) || (int) $order_id_or_order <= 0) {
        return null;
    }

    $order = wc_get_order((int) $order_id_or_order);
    return $order instanceof WC_Order ? $order : null;
}

/**
 * Statuses we never auto-change from (avoid fighting refunds/cancellations).
 *
 * @return list<string>
 */
function joya_payment_processing_blocked_statuses(): array
{
    return ['cancelled', 'refunded', 'trash'];
}

/**
 * After Woo marks payment complete — log and fix stuck pending/on-hold if a gateway misbehaved.
 *
 * Fires from WC_Order::payment_complete() after internal status update + save.
 *
 * @param int $order_id
 */
function joya_wc_payment_complete_processing(int $order_id): void
{
    $order = joya_payment_processing_get_order($order_id);
    if (!$order) {
        joya_payment_processing_log('warning', 'woocommerce_payment_complete: order not found', [
            'order_id' => $order_id,
        ]);
        return;
    }

    $status = $order->get_status();

    joya_payment_processing_log('info', 'woocommerce_payment_complete', [
        'order_id' => $order->get_id(),
        'status'   => $status,
    ]);

    if (in_array($status, joya_payment_processing_blocked_statuses(), true)) {
        joya_payment_processing_log(
            'notice',
            'woocommerce_payment_complete: skipped — terminal status',
            ['order_id' => $order->get_id(), 'status' => $status]
        );
        return;
    }

    // Already where we want (or further, e.g. completed for virtual/downloadable).
    if ($order->has_status(['processing', 'completed'])) {
        return;
    }

    // Defensive: payment_complete ran but order still awaiting payment state.
    if ($order->has_status(['pending', 'on-hold'])) {
        $order->update_status(
            'processing',
            __('Payment recorded: order set to processing (server-side safeguard).', 'joya'),
            true
        );
        joya_payment_processing_log('warning', 'woocommerce_payment_complete: corrected stuck status to processing', [
            'order_id'     => $order->get_id(),
            'prior_status' => $status,
        ]);
    }
}

add_action('woocommerce_payment_complete', 'joya_wc_payment_complete_processing', 20, 1);

/**
 * Log every transition pending → processing (covers gateways that use update_status without payment_complete,
 * manual admin moves, or other backend paths). Does not change status — WC already did.
 *
 * @param int      $order_id
 * @param WC_Order $order
 */
function joya_wc_log_pending_to_processing(int $order_id, $order): void
{
    $resolved = joya_payment_processing_get_order($order ?? $order_id);
    if (!$resolved) {
        joya_payment_processing_log('warning', 'pending_to_processing: order not found', [
            'order_id' => $order_id,
        ]);
        return;
    }

    joya_payment_processing_log('info', 'woocommerce_order_status_pending_to_processing', [
        'order_id'       => $resolved->get_id(),
        'status'         => $resolved->get_status(),
        'date_paid'      => $resolved->get_date_paid() ? $resolved->get_date_paid()->date('c') : null,
        'transaction_id' => $resolved->get_transaction_id(),
    ]);
}

add_action('woocommerce_order_status_pending_to_processing', 'joya_wc_log_pending_to_processing', 10, 2);

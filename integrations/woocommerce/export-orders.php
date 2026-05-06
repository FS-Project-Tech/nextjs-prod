<?php

/*--------------------------------------------------
ADD EXPORT MENU
--------------------------------------------------*/

add_action('admin_menu', 'joya_export_orders_menu');

function joya_export_orders_menu() {

    add_submenu_page(
        'woocommerce',
        'Export Orders',
        'Export Orders',
        'manage_woocommerce',
        'joya-export-orders',
        'joya_export_orders_page'
    );

}


/*--------------------------------------------------
EXPORT PAGE UI
--------------------------------------------------*/

function joya_export_orders_page() {
?>

<div class="wrap">
<h1>Export WooCommerce Orders</h1>

<form method="GET">

<input type="hidden" name="page" value="joya-export-orders">

<table class="form-table">

<tr>
<th>From Date</th>
<td><input type="date" name="from_date" required></td>
</tr>

<tr>
<th>To Date</th>
<td><input type="date" name="to_date" required></td>
</tr>

</table>

<input type="hidden" name="export_orders_csv" value="1">

<p>
<button class="button button-primary">Download Orders CSV</button>
</p>

</form>

</div>

<?php
}


/*--------------------------------------------------
EXPORT CSV
--------------------------------------------------*/

add_action('init','joya_export_orders_csv');

function joya_export_orders_csv(){

if(!isset($_GET['export_orders_csv'])){
return;
}

if(!current_user_can('manage_woocommerce')){
return;
}

if(empty($_GET['from_date']) || empty($_GET['to_date'])){
return;
}

$from = sanitize_text_field($_GET['from_date']);
$to   = sanitize_text_field($_GET['to_date']);

$from_date = $from.' 00:00:00';
$to_date   = $to.' 23:59:59';


if(ob_get_length()){
ob_end_clean();
}

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename=orders-'.$from.'-to-'.$to.'.csv');

$output = fopen('php://output','w');


fputcsv($output,array(
'Order ID',
'Order Number',
'Customer Name',
'Email',
'Phone',
'Total',
'Status',
'Date'
));


$args = array(
'limit' => -1,
'orderby' => 'date',
'order' => 'DESC',
'date_created' => $from_date.'...'.$to_date
);

$orders = wc_get_orders($args);


foreach($orders as $order){

fputcsv($output,array(

$order->get_id(),
'#'.$order->get_order_number(),
$order->get_billing_first_name().' '.$order->get_billing_last_name(),
$order->get_billing_email(),
$order->get_billing_phone(),
$order->get_total(),
$order->get_status(),
$order->get_date_created()->date('Y-m-d H:i:s')

));

}

fclose($output);
exit;

}
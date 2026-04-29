<?php

add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/typesense-products', [
        'methods' => 'GET',
        'permission_callback' => function (\WP_REST_Request $request) {
            $secret = trim((string) getenv('TYPESENSE_FEED_SECRET'));
            if ($secret === '') {
                return true;
            }
            $auth = (string) $request->get_header('authorization');
            $bearer = '';
            if (stripos($auth, 'Bearer ') === 0) {
                $bearer = trim(substr($auth, 7));
            }
            $query = trim((string) $request->get_param('secret'));
            return hash_equals($secret, $bearer !== '' ? $bearer : $query);
        },
        'callback' => function (\WP_REST_Request $request) {

            $single_product_id = absint($request->get_param('product_id'));
            $product_query = [
                'limit' => -1,
                'status' => 'publish', // ✅ ONLY published products
                'stock_status' => 'instock',
            ];
            if ($single_product_id > 0) {
                $target_ids = [$single_product_id];
                $target_product = wc_get_product($single_product_id);
                if ($target_product instanceof \WC_Product_Variation) {
                    $parent_id = (int) $target_product->get_parent_id();
                    if ($parent_id > 0) {
                        $target_ids[] = $parent_id;
                    }
                }
                $product_query['include'] = array_values(array_unique(array_map('absint', $target_ids)));
            }

            $products = wc_get_products($product_query);
            $data = [];

            function get_all_parents($term, &$slugs = []) {
                if ($term->parent) {
                    $parent = get_term($term->parent, 'product_cat');
                    if ($parent && !is_wp_error($parent)) {
                        $slugs[] = $parent->slug;
                        get_all_parents($parent, $slugs);
                    }
                }
            }

            /**
             * True when the stored variation value looks like an internal WooCommerce / plugin ID
             * (e.g. val_64733_9458824_934) rather than a human slug.
             */
            function joya_ts_is_internal_attr_value($value) {
                $s = is_string($value) ? trim($value) : '';
                if ($s === '') {
                    return true;
                }
                if (preg_match('/^val_[0-9_]+$/i', $s)) {
                    return true;
                }
                return false;
            }

            /**
             * Resolve one variation attribute meta key + raw stored value to a customer-facing string.
             * Uses WC_Product_Variation::get_attribute() first (handles most taxonomies), then parent
             * attribute options / term IDs when the stored value is val_* or non-slug.
             *
             * @param WC_Product_Variation $variation
             * @param string               $meta_key e.g. attribute_pa_size or attribute_custom
             * @param string               $raw_value stored post meta value
             */
            function joya_ts_resolve_variation_attr_display($variation, $meta_key, $raw_value) {
                $raw_value = is_string($raw_value) ? trim($raw_value) : '';
                if ($raw_value === '') {
                    return '';
                }

                $attr_name = str_replace('attribute_', '', $meta_key);
                $attr_name = wc_sanitize_taxonomy_name($attr_name);

                $via_wc = $variation->get_attribute($attr_name);
                if (is_string($via_wc) && $via_wc !== '' && !joya_ts_is_internal_attr_value($via_wc)) {
                    return $via_wc;
                }

                $tax = (strpos($attr_name, 'pa_') === 0)
                    ? $attr_name
                    : wc_attribute_taxonomy_name($attr_name);
                if (taxonomy_exists($tax)) {
                    $term = get_term_by('slug', $raw_value, $tax);
                    if (!$term || is_wp_error($term)) {
                        $term = is_numeric($raw_value) ? get_term((int) $raw_value, $tax) : null;
                    }
                    if ($term && !is_wp_error($term)) {
                        return $term->name;
                    }
                }

                $parent = $variation->get_parent_id() ? wc_get_product($variation->get_parent_id()) : null;
                if ($parent && method_exists($parent, 'get_attributes')) {
                    $attrs = $parent->get_attributes();
                    if (isset($attrs[$attr_name]) && is_object($attrs[$attr_name])) {
                        /** @var WC_Product_Attribute $attr_obj */
                        $attr_obj = $attrs[$attr_name];
                        if ($attr_obj->is_taxonomy()) {
                            $opt_ids = $attr_obj->get_options();
                            foreach ($opt_ids as $tid) {
                                $tid = (int) $tid;
                                if ($tid <= 0) {
                                    continue;
                                }
                                $t = get_term($tid, $attr_obj->get_name());
                                if ($t && !is_wp_error($t)) {
                                    if ($t->slug === $raw_value || (string) $t->term_id === $raw_value) {
                                        return $t->name;
                                    }
                                }
                            }
                        } else {
                            foreach ($attr_obj->get_options() as $opt) {
                                $opt_s = is_string($opt) ? $opt : (string) $opt;
                                if ($opt_s === '' || joya_ts_is_internal_attr_value($opt_s)) {
                                    continue;
                                }
                                if ($opt_s === $raw_value || sanitize_title($opt_s) === $raw_value || sanitize_title($opt_s) === sanitize_title($raw_value)) {
                                    return $opt_s;
                                }
                            }
                        }
                    }
                }

                if (!joya_ts_is_internal_attr_value($raw_value)) {
                    return wc_clean(str_replace('-', ' ', $raw_value));
                }

                return '';
            }

            /**
             * Human-readable tokens from a variation (attributes + optional variation description)
             * so Typesense can match size/color/etc. on the parent document.
             */
            function joya_ts_variation_search_tokens($variation) {
                $parts = [];
                if (!$variation || !$variation->is_type('variation')) {
                    return $parts;
                }

                foreach ($variation->get_variation_attributes() as $meta_key => $raw) {
                    $raw = is_string($raw) ? trim($raw) : '';
                    if ($raw === '') {
                        continue;
                    }
                    $display = joya_ts_resolve_variation_attr_display($variation, $meta_key, $raw);
                    if ($display !== '') {
                        $parts[] = $display;
                        $parts[] = str_replace('-', ' ', sanitize_title($display));
                    }
                }

                $vdesc = $variation->get_description();
                if ($vdesc) {
                    $parts[] = strip_tags($vdesc);
                }

                return $parts;
            }

            /** One-line label for search dropdown (attribute names, no HTML). */
            function joya_ts_variation_display_label($variation) {
                $parts = [];
                if (!$variation || !$variation->is_type('variation')) {
                    return '';
                }
                foreach ($variation->get_variation_attributes() as $meta_key => $raw) {
                    $raw = is_string($raw) ? trim($raw) : '';
                    if ($raw === '') {
                        continue;
                    }
                    $display = joya_ts_resolve_variation_attr_display($variation, $meta_key, $raw);
                    if ($display !== '') {
                        $parts[] = $display;
                    }
                }
                return implode(' · ', array_filter($parts));
            }

            /**
             * Tax fields for Typesense so search cards match PDP (GST free vs incl./excl.).
             * Variations often have an empty tax_class in WooCommerce = inherit from parent.
             *
             * @param \WC_Product      $product Simple, variable parent, or variation.
             * @param \WC_Product|null $parent  Parent product when $product is a variation.
             */
            function joya_ts_effective_tax_fields($product, $parent = null) {
                if (!$product || !is_a($product, 'WC_Product')) {
                    return [
                        'tax_status' => 'taxable',
                        'tax_class' => '',
                        'gst_free' => false,
                    ];
                }

                $status = (string) $product->get_tax_status();
                $class = (string) $product->get_tax_class();

                if ($parent && is_a($parent, 'WC_Product')) {
                    if ($class === '') {
                        $class = (string) $parent->get_tax_class();
                    }
                    if ($status === '') {
                        $status = (string) $parent->get_tax_status();
                    }
                }

                if ($status === '') {
                    $status = 'taxable';
                }

                $lclass = strtolower(str_replace([' ', '_'], '-', $class));
                // Mirror lib/format-utils getTaxDisplayType "gst free" class heuristics.
                $gst_free = ($status === 'none')
                    || $lclass === 'gst-free'
                    || $lclass === 'gstfree'
                    || strpos($lclass, 'free') !== false
                    || strpos($lclass, 'exempt') !== false
                    || strpos($lclass, 'zero') !== false;

                return [
                    'tax_status' => $status,
                    'tax_class' => $class,
                    'gst_free' => (bool) $gst_free,
                ];
            }

            /**
             * Variation attributes as an object for Typesense (string keys → string values).
             * Taxonomy slugs like pa_color are turned into keys like "color"; values use term names ("Red").
             */
            function joya_ts_variation_attributes_for_typesense($variation) {
                $out = [];
                if (!$variation || !$variation->is_type('variation')) {
                    return $out;
                }
                foreach ($variation->get_variation_attributes() as $meta_key => $raw) {
                    $raw = is_string($raw) ? trim($raw) : '';
                    if ($raw === '') {
                        continue;
                    }
                    $attr_name = str_replace('attribute_', '', $meta_key);
                    $attr_name = wc_sanitize_taxonomy_name($attr_name);
                    if (strpos($attr_name, 'pa_') === 0) {
                        $label_key = sanitize_key(substr($attr_name, 3));
                    } else {
                        $label_key = sanitize_key($attr_name);
                    }
                    if ($label_key === '') {
                        $label_key = 'attribute';
                    }
                    $display = joya_ts_resolve_variation_attr_display($variation, $meta_key, $raw);
                    if ($display !== '') {
                        $out[$label_key] = $display;
                    }
                }
                return $out;
            }

            foreach ($products as $product) {
                // Keep feed restricted to visible, purchasable catalogue rows.
                if ($product->get_status() !== 'publish') {
                    continue;
                }
                if (!$product->is_in_stock()) {
                    continue;
                }

                // 🔥 MULTI-SKU LOGIC
                $sku_array = [];
                $variation_search_tokens = [];
                $variation_dropdown = [];
                /** @var WC_Product_Variation[] Cached variation objects — reused below for Typesense variation docs (one wc_get_product per variation). */
                $loaded_variations = [];

                if ($product->is_type('variable')) {
                    $variations = $product->get_children();

                    foreach ($variations as $variation_id) {
                        $variation = wc_get_product($variation_id);
                        if (
                            !$variation ||
                            $variation->get_status() !== 'publish' ||
                            !$variation->is_in_stock()
                        ) {
                            continue;
                        }

                        if ($variation && $variation->get_sku()) {
                            $sku_array[] = $variation->get_sku();
                        }

                        if ($variation) {
                            $loaded_variations[] = $variation;
                            $variation_search_tokens = array_merge(
                                $variation_search_tokens,
                                joya_ts_variation_search_tokens($variation)
                            );
                            $vlabel = joya_ts_variation_display_label($variation);
                            $variation_dropdown[] = [
                                'id' => (int) $variation->get_id(),
                                'label' => $vlabel !== '' ? $vlabel : ('Variation #' . (int) $variation->get_id()),
                                'sku' => (string) $variation->get_sku(),
                                'price' => (float) $variation->get_price(),
                            ];
                        }
                    }
                }

                if ($product->get_sku()) {
                    $sku_array[] = $product->get_sku();
                }

                $sku_array = array_values(array_unique(array_filter($sku_array)));

                $variation_search_tokens = array_values(array_unique(array_filter(array_map('trim', $variation_search_tokens))));

                // ✅ CATEGORY
                $category_terms = wp_get_post_terms($product->get_id(), 'product_cat');
                $category_slugs = [];

                foreach ($category_terms as $term) {
                    $category_slugs[] = $term->slug;
                    get_all_parents($term, $category_slugs);
                }

                $category_slugs = array_values(array_unique($category_slugs));

                // ✅ BRAND
                $brand_terms = wp_get_post_terms($product->get_id(), 'product_brand');
                $brand_slugs = [];

                foreach ($brand_terms as $term) {
                    $brand_slugs[] = $term->slug;
                }

                // ✅ TAGS (NEW)
                $tag_terms = wp_get_post_terms($product->get_id(), 'product_tag');
                $tag_slugs = [];

                foreach ($tag_terms as $term) {
                    $tag_slugs[] = $term->slug;
                }

                // ✅ PRICE LOGIC (IMPROVED)
                $regular_price = (float) $product->get_regular_price();
                $sale_price    = (float) $product->get_sale_price();
                $current_price = (float) $product->get_price();

                $description = strip_tags($product->get_description());
                if (!empty($variation_search_tokens)) {
                    $description = trim($description . ' ' . implode(' ', $variation_search_tokens));
                }

                $variation_dropdown_json = null;
                if (!empty($variation_dropdown)) {
                    $variation_dropdown_json = wp_json_encode($variation_dropdown);
                }

                $parent_id_string = (string) $product->get_id();

                $modified = $product->get_date_modified();
                $created = $product->get_date_created();
                $parent_updated = ($modified && method_exists($modified, 'date'))
                    ? (int) strtotime($modified->date('c'))
                    : (int) get_post_modified_time('U', true, $product->get_id(), true);
                $parent_created = ($created && method_exists($created, 'date'))
                    ? (int) strtotime($created->date('c'))
                    : (int) get_post_time('U', true, $product->get_id(), true);
                if ($parent_updated <= 0) {
                    $parent_updated = time();
                }
                if ($parent_created <= 0) {
                    $parent_created = $parent_updated;
                }
                // Prefer custom sku_order_count (from MU plugin); fallback to Woo total_sales.
                $parent_popularity = (int) get_post_meta($product->get_id(), 'sku_order_count', true);
                if ($parent_popularity <= 0) {
                    $parent_popularity = (int) $product->get_total_sales();
                }
                if ($parent_popularity < 0) {
                    $parent_popularity = 0;
                }

                $parent_tax = joya_ts_effective_tax_fields($product, null);

                // Parent (or simple) document: same fields as before + type/parent_id for Typesense group_by parent_id.
                // parent_id equals id on the canonical product row so grouped hits collapse to one “product family”.
                $data[] = [
                    "id" => $parent_id_string,
                    "name" => $product->get_name(),
                    "slug" => $product->get_slug(),

                    "sku" => $sku_array,

                    "description" => $description,

                    "variation_dropdown_json" => $variation_dropdown_json,

                    // ✅ PRICING
                    "price" => $current_price,        // active price
                    "regular_price" => $regular_price,
                    "sale_price" => $sale_price ?: null, // null if no sale

                    "on_sale" => $product->is_on_sale(),

                    "tax_status" => $parent_tax['tax_status'],
                    "tax_class" => $parent_tax['tax_class'],
                    "gst_free" => $parent_tax['gst_free'],

                    "image" => wp_get_attachment_url($product->get_image_id()),

                    "category" => $category_slugs,
                    "brand" => $brand_slugs,

                    // ✅ NEW FIELD
                    "tags" => $tag_slugs,

                    "in_stock" => $product->is_in_stock(),

                    // Typesense: facet/filter + group_by parent_id — simple products use type "parent" with parent_id = id.
                    "type" => "parent",
                    "parent_id" => $parent_id_string,
                    "popularity" => $parent_popularity,
                    "date_created" => $parent_created,

                    "updated_at" => $parent_updated,
                ];

                // Variation documents: separate ids (variation post ID) so SKU search can return the exact variation;
                // parent_id links back to the parent for group_by and UI rollups.
                foreach ($loaded_variations as $variation) {
                    if (
                        !$variation ||
                        $variation->get_status() !== 'publish' ||
                        !$variation->is_in_stock()
                    ) {
                        continue;
                    }
                    $attr_map   = joya_ts_variation_attributes_for_typesense($variation);
                    $v_label    = joya_ts_variation_display_label($variation);
                    $var_name   = trim($product->get_name() . ($v_label !== '' ? ' - ' . $v_label : ''));
                    $var_image  = wp_get_attachment_url($variation->get_image_id());
                    if (!$var_image) {
                        $var_image = wp_get_attachment_url($product->get_image_id());
                    }
                    $var_updated = (int) get_post_modified_time('U', true, $variation->get_id(), true);
                    $var_created = (int) get_post_time('U', true, $variation->get_id(), true);
                    if ($var_updated <= 0) {
                        $var_updated = time();
                    }
                    if ($var_created <= 0) {
                        $var_created = $var_updated;
                    }
                    // Variation-level popularity should use variation sku_order_count first,
                    // then fallback to parent total_sales when backfill hasn't run yet.
                    $var_popularity = (int) get_post_meta($variation->get_id(), 'sku_order_count', true);
                    if ($var_popularity <= 0) {
                        $var_popularity = (int) $product->get_total_sales();
                    }
                    if ($var_popularity < 0) {
                        $var_popularity = 0;
                    }

                    $var_tax = joya_ts_effective_tax_fields($variation, $product);

                    $data[] = [
                        "id" => (string) $variation->get_id(),
                        "name" => $var_name,
                        "slug" => $product->get_slug(),
                        "type" => "variation",
                        "parent_id" => $parent_id_string,
                        "popularity" => $var_popularity,
                        "date_created" => $var_created,
                        "custom_badge" => $custom_badge,
                        // Typesense `sku` is string[] — match parent rows for a single schema type.
                        "sku" => $variation->get_sku() ? [(string) $variation->get_sku()] : [],
                        "price" => (float) $variation->get_price(),
                        "tax_status" => $var_tax['tax_status'],
                        "tax_class" => $var_tax['tax_class'],
                        "gst_free" => $var_tax['gst_free'],
                        "category" => $category_slugs,
                        "brand" => $brand_slugs,
                        "tags" => $tag_slugs,
                        "attributes" => empty($attr_map) ? new \stdClass() : $attr_map,
                        "image" => $var_image ? $var_image : '',
                        "in_stock" => $variation->is_in_stock(),
                        "updated_at" => $var_updated,
                    ];
                }
            }

            return $data;
        }
    ]);
});

/**
 * WooCommerce -> Next Typesense bridge
 *
 * Required env/config on WP:
 * - TYPESENSE_SYNC_BASE_URL (or JOYA_NEXT_API_BASE) e.g. https://your-next-app.com
 * - TYPESENSE_SYNC_SECRET for /api/typesense/search/sync
 * - TYPESENSE_DELETE_SECRET for /api/typesense/search/delete
 */
function joya_ts_sync_base_url() {
    if (defined('TYPESENSE_SYNC_BASE_URL') && TYPESENSE_SYNC_BASE_URL) {
        return rtrim((string) TYPESENSE_SYNC_BASE_URL, '/');
    }
    if (defined('JOYA_NEXT_API_BASE') && JOYA_NEXT_API_BASE) {
        return rtrim((string) JOYA_NEXT_API_BASE, '/');
    }
    $env = trim((string) getenv('TYPESENSE_SYNC_BASE_URL'));
    return $env !== '' ? rtrim($env, '/') : '';
}

function joya_ts_sync_secret() {
    $v = trim((string) getenv('TYPESENSE_SYNC_SECRET'));
    if ($v !== '') {
        return $v;
    }
    $fallback = trim((string) getenv('SYNC_SECRET'));
    return $fallback;
}

function joya_ts_delete_secret() {
    $v = trim((string) getenv('TYPESENSE_DELETE_SECRET'));
    if ($v !== '') {
        return $v;
    }
    $fallback = trim((string) getenv('SYNC_SECRET'));
    return $fallback;
}

function joya_ts_logging_enabled() {
    if (defined('JOYA_TYPESENSE_SYNC_LOG')) {
        return (bool) JOYA_TYPESENSE_SYNC_LOG;
    }
    $env = strtolower(trim((string) getenv('JOYA_TYPESENSE_SYNC_LOG')));
    return in_array($env, ['1', 'true', 'yes', 'on'], true);
}

function joya_ts_log($level, $message, $context = []) {
    if (!joya_ts_logging_enabled()) {
        return;
    }
    $payload = [
        'level' => (string) $level,
        'message' => (string) $message,
        'context' => is_array($context) ? $context : [],
    ];
    error_log('[joya-typesense-sync] ' . wp_json_encode($payload));
}

function joya_ts_push_admin_activity($level, $message, $context = []) {
    $max = 100;
    $rows = get_option('joya_ts_sync_activity_log', []);
    if (!is_array($rows)) {
        $rows = [];
    }
    $rows[] = [
        'ts' => time(),
        'level' => (string) $level,
        'message' => (string) $message,
        'context' => is_array($context) ? $context : [],
    ];
    if (count($rows) > $max) {
        $rows = array_slice($rows, -$max);
    }
    update_option('joya_ts_sync_activity_log', $rows, false);
}

function joya_ts_log_with_activity($level, $message, $context = []) {
    joya_ts_log($level, $message, $context);
    joya_ts_push_admin_activity($level, $message, $context);
}

function joya_ts_is_supported_post_type($post_type) {
    return in_array((string) $post_type, ['product', 'product_variation'], true);
}

function joya_ts_normalize_sync_id($product_id) {
    $product_id = absint($product_id);
    if ($product_id <= 0) {
        return 0;
    }
    $product = wc_get_product($product_id);
    if ($product instanceof \WC_Product_Variation) {
        $parent_id = (int) $product->get_parent_id();
        if ($parent_id > 0) {
            return $parent_id;
        }
    }
    return $product_id;
}

function joya_ts_call_sync_endpoint($product_id) {
    $product_id = joya_ts_normalize_sync_id($product_id);
    if ($product_id <= 0) {
        joya_ts_log_with_activity('debug', 'sync skipped: invalid product id', ['product_id' => $product_id]);
        return;
    }
    $base = joya_ts_sync_base_url();
    $secret = joya_ts_sync_secret();
    if ($base === '' || $secret === '') {
        joya_ts_log_with_activity('warning', 'sync skipped: missing base/secret', [
            'has_base' => $base !== '',
            'has_secret' => $secret !== '',
            'product_id' => $product_id,
        ]);
        return;
    }

    $res = wp_remote_post($base . '/api/typesense/search/sync', [
        'timeout' => 5,
        'blocking' => false,
        'headers' => [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $secret,
        ],
        'body' => wp_json_encode(['product_id' => $product_id]),
    ]);
    if (is_wp_error($res)) {
        joya_ts_log_with_activity('error', 'sync request failed', [
            'product_id' => $product_id,
            'error' => $res->get_error_message(),
        ]);
    } else {
        joya_ts_log_with_activity('info', 'sync request dispatched', ['product_id' => $product_id]);
    }
}

function joya_ts_call_delete_endpoint($id) {
    $id = absint($id);
    if ($id <= 0) {
        joya_ts_log_with_activity('debug', 'delete skipped: invalid id', ['id' => $id]);
        return;
    }
    $base = joya_ts_sync_base_url();
    $secret = joya_ts_delete_secret();
    if ($base === '' || $secret === '') {
        joya_ts_log_with_activity('warning', 'delete skipped: missing base/secret', [
            'has_base' => $base !== '',
            'has_secret' => $secret !== '',
            'id' => $id,
        ]);
        return;
    }

    $url = add_query_arg('id', (string) $id, $base . '/api/typesense/search/delete');
    $res = wp_remote_request($url, [
        'method' => 'DELETE',
        'timeout' => 5,
        'blocking' => false,
        'headers' => [
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $secret,
        ],
    ]);
    if (is_wp_error($res)) {
        joya_ts_log_with_activity('error', 'delete request failed', [
            'id' => $id,
            'error' => $res->get_error_message(),
        ]);
    } else {
        joya_ts_log_with_activity('info', 'delete request dispatched', ['id' => $id]);
    }
}

function joya_ts_schedule_sync($product_id) {
    $normalized_id = joya_ts_normalize_sync_id($product_id);
    if ($normalized_id <= 0) {
        joya_ts_log_with_activity('debug', 'schedule skipped: invalid normalized id', [
            'product_id' => $product_id,
            'normalized_id' => $normalized_id,
        ]);
        return;
    }
    $hook = 'joya_ts_deferred_sync_single';
    if (!wp_next_scheduled($hook, [$normalized_id])) {
        wp_schedule_single_event(time() + 2, $hook, [$normalized_id]);
        joya_ts_log_with_activity('debug', 'scheduled deferred sync', ['product_id' => $normalized_id]);
    } else {
        joya_ts_log_with_activity('debug', 'schedule skipped: already queued', ['product_id' => $normalized_id]);
    }
}

add_action('joya_ts_deferred_sync_single', function ($product_id) {
    joya_ts_log_with_activity('debug', 'running deferred sync', ['product_id' => (int) $product_id]);
    joya_ts_call_sync_endpoint((int) $product_id);
}, 10, 1);

add_action('save_post', function ($post_id, $post, $update) {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
        return;
    }
    if (!$post || !joya_ts_is_supported_post_type($post->post_type)) {
        return;
    }
    joya_ts_log_with_activity('debug', 'save_post trigger', [
        'post_id' => (int) $post_id,
        'post_type' => (string) $post->post_type,
        'update' => (bool) $update,
    ]);
    joya_ts_schedule_sync((int) $post_id);
}, 20, 3);

add_action('woocommerce_update_product', function ($product_id) {
    joya_ts_schedule_sync((int) $product_id);
}, 20, 1);

add_action('woocommerce_new_product', function ($product_id) {
    joya_ts_schedule_sync((int) $product_id);
}, 20, 1);

add_action('woocommerce_product_set_stock_status', function ($product_id) {
    joya_ts_schedule_sync((int) $product_id);
}, 20, 1);

add_action('woocommerce_variation_set_stock_status', function ($variation_id) {
    joya_ts_schedule_sync((int) $variation_id);
}, 20, 1);

add_action('before_delete_post', function ($post_id) {
    $post = get_post($post_id);
    if (!$post || !joya_ts_is_supported_post_type($post->post_type)) {
        return;
    }

    $parent_id = (int) wp_get_post_parent_id($post_id);
    joya_ts_call_delete_endpoint((int) $post_id);
    if ($parent_id > 0) {
        joya_ts_log_with_activity('debug', 'before_delete_post parent resync', [
            'post_id' => (int) $post_id,
            'parent_id' => $parent_id,
        ]);
        joya_ts_schedule_sync($parent_id);
    }
}, 20, 1);

add_action('trashed_post', function ($post_id) {
    $post = get_post($post_id);
    if (!$post || !joya_ts_is_supported_post_type($post->post_type)) {
        return;
    }
    joya_ts_call_delete_endpoint((int) $post_id);
}, 20, 1);

function joya_ts_admin_capability() {
    return current_user_can('manage_woocommerce') ? 'manage_woocommerce' : 'manage_options';
}

add_action('admin_menu', function () {
    add_submenu_page(
        'woocommerce',
        'Typesense Sync Activity',
        'Typesense Sync Activity',
        joya_ts_admin_capability(),
        'joya-typesense-sync-activity',
        'joya_ts_render_activity_page'
    );
});

function joya_ts_render_activity_page() {
    if (!current_user_can(joya_ts_admin_capability())) {
        wp_die(esc_html__('You do not have permission to view this page.', 'joya'));
    }

    if (isset($_POST['joya_ts_clear_activity']) && check_admin_referer('joya_ts_clear_activity_nonce')) {
        update_option('joya_ts_sync_activity_log', [], false);
        echo '<div class="notice notice-success"><p>Typesense sync activity log cleared.</p></div>';
    }

    $rows = get_option('joya_ts_sync_activity_log', []);
    if (!is_array($rows)) {
        $rows = [];
    }
    $rows = array_reverse($rows);

    echo '<div class="wrap">';
    echo '<h1>Typesense Sync Activity</h1>';
    echo '<p>Recent WooCommerce to Typesense sync/delete events.</p>';
    echo '<style>
        .joya-ts-level{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.5}
        .joya-ts-level-debug{background:#eef2ff;color:#3730a3}
        .joya-ts-level-info{background:#ecfdf5;color:#065f46}
        .joya-ts-level-warning{background:#fffbeb;color:#92400e}
        .joya-ts-level-error{background:#fef2f2;color:#991b1b}
    </style>';
    echo '<form method="post" style="margin:12px 0;">';
    wp_nonce_field('joya_ts_clear_activity_nonce');
    echo '<button type="submit" class="button" name="joya_ts_clear_activity" value="1">Clear Activity Log</button>';
    echo '</form>';

    echo '<table class="widefat striped">';
    echo '<thead><tr>';
    echo '<th style="width:180px;">Time</th>';
    echo '<th style="width:100px;">Level</th>';
    echo '<th style="width:320px;">Message</th>';
    echo '<th>Context</th>';
    echo '</tr></thead><tbody>';

    if (empty($rows)) {
        echo '<tr><td colspan="4">No activity yet.</td></tr>';
    } else {
        foreach ($rows as $row) {
            $ts = isset($row['ts']) ? (int) $row['ts'] : 0;
            $level = isset($row['level']) ? (string) $row['level'] : '';
            $level_class = 'joya-ts-level-' . sanitize_html_class(strtolower($level));
            $message = isset($row['message']) ? (string) $row['message'] : '';
            $context = isset($row['context']) && is_array($row['context']) ? $row['context'] : [];
            $context_json = wp_json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            echo '<tr>';
            echo '<td>' . esc_html($ts > 0 ? wp_date('Y-m-d H:i:s', $ts) : '-') . '</td>';
            echo '<td><span class="joya-ts-level ' . esc_attr($level_class) . '">' . esc_html($level) . '</span></td>';
            echo '<td>' . esc_html($message) . '</td>';
            echo '<td><code style="white-space:pre-wrap;word-break:break-word;">' . esc_html((string) $context_json) . '</code></td>';
            echo '</tr>';
        }
    }

    echo '</tbody></table>';
    echo '</div>';
}
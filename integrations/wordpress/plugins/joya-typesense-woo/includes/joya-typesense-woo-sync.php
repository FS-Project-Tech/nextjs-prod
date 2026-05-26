<?php
/**
 * Shared implementation: REST product feed + Woo → Next Typesense sync hooks + admin log UI.
 * Loaded by the Joya Typesense Woo plugin bootstrap or legacy `integrations/woo-search-api.php`.
 */

if (defined('JOYA_TYPESENSE_WOO_SYNC_INCLUDED')) {
    return;
}
define('JOYA_TYPESENSE_WOO_SYNC_INCLUDED', true);

function joya_ts_schema_fields(): array {
    return [
        'id' => ['type' => 'string', 'required' => true, 'label' => 'Document ID'],
        'name' => ['type' => 'string', 'required' => true, 'label' => 'Product name'],
        'slug' => ['type' => 'string', 'required' => true, 'label' => 'Product slug'],
        'custom_badge' => ['type' => 'string', 'required' => false, 'label' => 'Custom badge'],
        'sku' => ['type' => 'string[]', 'required' => false, 'label' => 'SKU values'],
        'type' => ['type' => 'string', 'required' => true, 'label' => 'Document type'],
        'parent_id' => ['type' => 'string', 'required' => true, 'label' => 'Parent product ID'],
        'attributes' => ['type' => 'object', 'required' => false, 'label' => 'Variation attributes'],
        'description' => ['type' => 'string', 'required' => false, 'label' => 'Description'],
        'short_description' => ['type' => 'string', 'required' => false, 'label' => 'Short description'],
        'variation_dropdown_json' => ['type' => 'string', 'required' => false, 'label' => 'Variation dropdown JSON'],
        'price' => ['type' => 'float', 'required' => true, 'label' => 'Price'],
        'regular_price' => ['type' => 'float', 'required' => false, 'label' => 'Regular price'],
        'sale_price' => ['type' => 'float', 'required' => false, 'label' => 'Sale price'],
        'on_sale' => ['type' => 'bool', 'required' => false, 'label' => 'On sale'],
        'tax_class' => ['type' => 'string', 'required' => false, 'label' => 'Tax class'],
        'tax_status' => ['type' => 'string', 'required' => false, 'label' => 'Tax status'],
        'gst_free' => ['type' => 'bool', 'required' => false, 'label' => 'GST free'],
        'category' => ['type' => 'string[]', 'required' => false, 'label' => 'Category slugs'],
        'brand' => ['type' => 'string[]', 'required' => false, 'label' => 'Brand slugs'],
        'tags' => ['type' => 'string[]', 'required' => false, 'label' => 'Tag slugs'],
        'in_stock' => ['type' => 'bool', 'required' => false, 'label' => 'In stock'],
        'image' => ['type' => 'string', 'required' => false, 'label' => 'Image URL'],
        'average_rating' => ['type' => 'float', 'required' => false, 'label' => 'Average rating'],
        'rating_count' => ['type' => 'int32', 'required' => false, 'label' => 'Rating count'],
        'popularity' => ['type' => 'int32', 'required' => false, 'label' => 'Popularity'],
        'date_created' => ['type' => 'int64', 'required' => false, 'label' => 'Created timestamp'],
        'updated_at' => ['type' => 'int64', 'required' => true, 'label' => 'Updated timestamp'],
    ];
}

function joya_ts_default_field_mappings(): array {
    $mappings = [];
    foreach (joya_ts_schema_fields() as $field => $schema) {
        $mappings[$field] = [
            'source' => 'core',
            'key' => '',
        ];
    }

    return $mappings;
}

function joya_ts_field_mapping_sources(): array {
    return [
        'core' => __('Computed WooCommerce value', 'joya-typesense-woo'),
        'meta' => __('Product meta key', 'joya-typesense-woo'),
        'taxonomy' => __('Taxonomy slugs', 'joya-typesense-woo'),
        'attribute' => __('Product attribute', 'joya-typesense-woo'),
        'none' => __('Do not sync this optional field', 'joya-typesense-woo'),
    ];
}

function joya_ts_get_field_mappings(): array {
    $defaults = joya_ts_default_field_mappings();
    $saved = get_option('joya_ts_field_mappings', []);
    if (!is_array($saved)) {
        return $defaults;
    }

    $sources = array_keys(joya_ts_field_mapping_sources());
    foreach ($defaults as $field => $default) {
        $row = isset($saved[$field]) && is_array($saved[$field]) ? $saved[$field] : [];
        $source = isset($row['source']) ? sanitize_key((string) $row['source']) : $default['source'];
        $defaults[$field]['source'] = in_array($source, $sources, true) ? $source : $default['source'];
        $defaults[$field]['key'] = isset($row['key']) ? sanitize_text_field((string) $row['key']) : '';
    }

    return $defaults;
}

function joya_ts_sanitize_field_mappings($raw): array {
    $defaults = joya_ts_default_field_mappings();
    $sources = array_keys(joya_ts_field_mapping_sources());
    $raw = is_array($raw) ? $raw : [];

    foreach (joya_ts_schema_fields() as $field => $schema) {
        $row = isset($raw[$field]) && is_array($raw[$field]) ? $raw[$field] : [];
        $source = isset($row['source']) ? sanitize_key((string) wp_unslash($row['source'])) : 'core';
        $key = isset($row['key']) ? sanitize_text_field((string) wp_unslash($row['key'])) : '';

        if (!in_array($source, $sources, true)) {
            $source = 'core';
        }
        if (!empty($schema['required']) && $source === 'none') {
            $source = 'core';
        }

        $defaults[$field] = [
            'source' => $source,
            'key' => $key,
        ];
    }

    return $defaults;
}

function joya_ts_custom_badge_for_product($product, $parent = null): string {
    $ids = [];
    if ($product instanceof \WC_Product) {
        $ids[] = (int) $product->get_id();
    }
    if ($parent instanceof \WC_Product) {
        $ids[] = (int) $parent->get_id();
    }

    $meta_keys = apply_filters('joya_ts_custom_badge_meta_keys', [
        'custom_badge',
        '_custom_badge',
        'product_badge',
        '_product_badge',
        'badge',
        '_badge',
    ]);

    foreach (array_values(array_unique(array_filter($ids))) as $id) {
        foreach ($meta_keys as $meta_key) {
            $value = get_post_meta($id, (string) $meta_key, true);
            if (is_scalar($value) && trim((string) $value) !== '') {
                return trim(wp_strip_all_tags((string) $value));
            }
        }
    }

    return '';
}

function joya_ts_cast_mapped_value($value, string $type) {
    if ($value === null) {
        return null;
    }

    if ($type === 'string[]') {
        if (is_string($value)) {
            $value = preg_split('/\s*,\s*/', $value);
        }
        if (!is_array($value)) {
            $value = [$value];
        }
        $items = [];
        foreach ($value as $item) {
            if (is_scalar($item)) {
                $item = trim((string) $item);
                if ($item !== '') {
                    $items[] = $item;
                }
            }
        }
        return array_values(array_unique($items));
    }

    if ($type === 'object') {
        if (is_array($value) || is_object($value)) {
            return empty((array) $value) ? new \stdClass() : $value;
        }
        if (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded) || is_object($decoded)) {
                return empty((array) $decoded) ? new \stdClass() : $decoded;
            }
        }
        return new \stdClass();
    }

    if ($type === 'bool') {
        if (is_bool($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return ((float) $value) > 0;
        }
        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on', 'instock'], true);
    }

    if ($type === 'float') {
        if ($value === '' || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return (float) $value;
    }

    if ($type === 'int32' || $type === 'int64') {
        if ($value === '' || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return (int) $value;
    }

    if (is_array($value) || is_object($value)) {
        return wp_json_encode($value);
    }

    return trim((string) $value);
}

function joya_ts_resolve_mapped_value(string $field, array $mapping, $product, $parent, $core_value) {
    $source = isset($mapping['source']) ? (string) $mapping['source'] : 'core';
    $key = isset($mapping['key']) ? trim((string) $mapping['key']) : '';

    if ($source === 'core') {
        return $core_value;
    }

    if ($source === 'none') {
        return null;
    }

    $product_id = $product instanceof \WC_Product ? (int) $product->get_id() : 0;
    $parent_id = $parent instanceof \WC_Product ? (int) $parent->get_id() : 0;

    if ($source === 'meta' && $key !== '') {
        $value = $product_id > 0 ? get_post_meta($product_id, $key, true) : '';
        if (($value === '' || $value === null) && $parent_id > 0) {
            $value = get_post_meta($parent_id, $key, true);
        }
        return $value;
    }

    if ($source === 'taxonomy' && $key !== '') {
        $lookup_id = $parent_id > 0 ? $parent_id : $product_id;
        if ($lookup_id <= 0 || !taxonomy_exists($key)) {
            return [];
        }
        $terms = wp_get_post_terms($lookup_id, $key, ['fields' => 'slugs']);
        return is_wp_error($terms) ? [] : $terms;
    }

    if ($source === 'attribute' && $key !== '' && $product instanceof \WC_Product) {
        $value = $product->get_attribute($key);
        if (($value === '' || $value === null) && $parent instanceof \WC_Product) {
            $value = $parent->get_attribute($key);
        }
        return $value;
    }

    return $core_value;
}

function joya_ts_apply_field_mappings_to_document(array $document, $product, $parent = null): array {
    $mappings = joya_ts_get_field_mappings();
    $schemas = joya_ts_schema_fields();

    foreach ($schemas as $field => $schema) {
        $required = !empty($schema['required']);
        $core_value = array_key_exists($field, $document) ? $document[$field] : null;
        $value = joya_ts_resolve_mapped_value($field, $mappings[$field] ?? ['source' => 'core', 'key' => ''], $product, $parent, $core_value);

        if ($value === null && !$required) {
            unset($document[$field]);
            continue;
        }

        $cast = joya_ts_cast_mapped_value($value, (string) $schema['type']);
        if (($cast === null || $cast === '') && $required) {
            $cast = joya_ts_cast_mapped_value($core_value, (string) $schema['type']);
        }

        if (($cast === null || $cast === '') && !$required) {
            unset($document[$field]);
            continue;
        }

        $document[$field] = $cast;
    }

    return $document;
}

function joya_ts_dedupe_typesense_documents(array $documents): array {
    $seen = [];
    $deduped = [];

    foreach ($documents as $document) {
        if (!is_array($document) || !isset($document['id'])) {
            continue;
        }
        $id = (string) $document['id'];
        if ($id === '') {
            continue;
        }
        if (isset($seen[$id])) {
            joya_ts_log_with_activity('warning', 'duplicate document skipped before sync feed response', ['id' => $id]);
            continue;
        }
        $seen[$id] = true;
        $deduped[] = $document;
    }

    return $deduped;
}

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
                // Typesense incremental sync must see the same prices as the storefront — flush cached
                // product / variation pricing before wc_get_products() (stale transients are a common
                // cause of "I updated Woo but search still shows the old price").
                if ($target_product instanceof \WC_Product) {
                    $clear_id = $target_product->is_type('variation')
                        ? (int) $target_product->get_parent_id()
                        : (int) $target_product->get_id();
                    if ($clear_id > 0 && function_exists('wc_delete_product_transients')) {
                        wc_delete_product_transients($clear_id);
                    }
                }
                // Drop persistent object cache for these rows so wc_get_products() does not reuse stale price meta.
                foreach ($product_query['include'] as $cid) {
                    $cid = (int) $cid;
                    if ($cid > 0) {
                        clean_post_cache($cid);
                    }
                }
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
                $short_description = strip_tags($product->get_short_description());
                $custom_badge = joya_ts_custom_badge_for_product($product);
                $average_rating = (float) $product->get_average_rating();
                $rating_count = (int) $product->get_rating_count();

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
                $parent_doc = [
                    "id" => $parent_id_string,
                    "name" => $product->get_name(),
                    "slug" => $product->get_slug(),
                    "custom_badge" => $custom_badge,

                    "sku" => $sku_array,

                    "description" => $description,
                    "short_description" => $short_description,

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
                    "average_rating" => $average_rating,
                    "rating_count" => $rating_count,
                    "popularity" => $parent_popularity,
                    "date_created" => $parent_created,

                    "updated_at" => $parent_updated,
                ];
                $data[] = joya_ts_apply_field_mappings_to_document($parent_doc, $product, null);

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
                    $var_custom_badge = joya_ts_custom_badge_for_product($variation, $product);
                    $var_description = strip_tags($variation->get_description());
                    $var_regular_price = (float) $variation->get_regular_price();
                    $var_sale_price = (float) $variation->get_sale_price();

                    $variation_doc = [
                        "id" => (string) $variation->get_id(),
                        "name" => $var_name,
                        "slug" => $product->get_slug(),
                        "type" => "variation",
                        "parent_id" => $parent_id_string,
                        "popularity" => $var_popularity,
                        "date_created" => $var_created,
                        "custom_badge" => $var_custom_badge,
                        // Typesense `sku` is string[] — match parent rows for a single schema type.
                        "sku" => $variation->get_sku() ? [(string) $variation->get_sku()] : [],
                        "price" => (float) $variation->get_price(),
                        "regular_price" => $var_regular_price,
                        "sale_price" => $var_sale_price ?: null,
                        "on_sale" => $variation->is_on_sale(),
                        "tax_status" => $var_tax['tax_status'],
                        "tax_class" => $var_tax['tax_class'],
                        "gst_free" => $var_tax['gst_free'],
                        "category" => $category_slugs,
                        "brand" => $brand_slugs,
                        "tags" => $tag_slugs,
                        "attributes" => empty($attr_map) ? new \stdClass() : $attr_map,
                        "description" => $var_description,
                        "short_description" => $var_description,
                        "image" => $var_image ? $var_image : '',
                        "in_stock" => $variation->is_in_stock(),
                        "average_rating" => $average_rating,
                        "rating_count" => $rating_count,
                        "updated_at" => $var_updated,
                    ];
                    $data[] = joya_ts_apply_field_mappings_to_document($variation_doc, $variation, $product);
                }
            }

            return joya_ts_dedupe_typesense_documents($data);
        }
    ]);
});

/**
 * WooCommerce -> Next Typesense bridge
 *
 * Required config on WP (wp-config.php `define(...)` and/or server env — constants are preferred):
 * - TYPESENSE_SYNC_BASE_URL or JOYA_NEXT_API_BASE — Next.js origin, e.g. https://shop.example.com
 * - TYPESENSE_SYNC_SECRET (or SYNC_SECRET) — Bearer token; must match Next.js env TYPESENSE_SYNC_SECRET
 * - TYPESENSE_DELETE_SECRET — optional; Bearer for deletes (falls back to SYNC_SECRET)
 * - VERCEL_PROTECTION_BYPASS_SECRET (optional) — same secret as Vercel → Project → Deployment Protection →
 *   "Protection Bypass for Automation". Required when Vercel returns 429 + HTML "Security Checkpoint" for wp_remote_post.
 *
 * This plugin calls Next.js, not Typesense directly. JOYA_TYPESENSE_HOST / admin keys are for a different integration.
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

function joya_ts_sync_secret(): string {
    if (defined('TYPESENSE_SYNC_SECRET') && (string) TYPESENSE_SYNC_SECRET !== '') {
        return trim((string) TYPESENSE_SYNC_SECRET);
    }
    $v = trim((string) getenv('TYPESENSE_SYNC_SECRET'));
    if ($v !== '') {
        return $v;
    }
    if (defined('SYNC_SECRET') && (string) SYNC_SECRET !== '') {
        return trim((string) SYNC_SECRET);
    }
    return trim((string) getenv('SYNC_SECRET'));
}

function joya_ts_delete_secret(): string {
    if (defined('TYPESENSE_DELETE_SECRET') && (string) TYPESENSE_DELETE_SECRET !== '') {
        return trim((string) TYPESENSE_DELETE_SECRET);
    }
    $v = trim((string) getenv('TYPESENSE_DELETE_SECRET'));
    if ($v !== '') {
        return $v;
    }
    if (defined('SYNC_SECRET') && (string) SYNC_SECRET !== '') {
        return trim((string) SYNC_SECRET);
    }
    return trim((string) getenv('SYNC_SECRET'));
}

/**
 * Vercel Deployment Protection / checkpoint bypass (server-to-server only).
 *
 * @see https://vercel.com/docs/security/deployment-protection#protection-bypass-for-automation
 */
function joya_ts_vercel_protection_bypass_secret(): string {
    if (defined('VERCEL_PROTECTION_BYPASS_SECRET') && (string) VERCEL_PROTECTION_BYPASS_SECRET !== '') {
        return trim((string) VERCEL_PROTECTION_BYPASS_SECRET);
    }
    foreach (['VERCEL_PROTECTION_BYPASS_SECRET', 'VERCEL_AUTOMATION_BYPASS_SECRET', 'TYPESENSE_SYNC_VERCEL_BYPASS'] as $env_key) {
        $v = trim((string) getenv($env_key));
        if ($v !== '') {
            return $v;
        }
    }
    return '';
}

/**
 * @param array<string,string> $headers
 * @return array<string,string>
 */
function joya_ts_merge_next_api_headers(array $headers): array {
    $bypass = joya_ts_vercel_protection_bypass_secret();
    if ($bypass !== '') {
        $headers['x-vercel-protection-bypass'] = $bypass;
    }
    return $headers;
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

function joya_ts_activity_status($level, $message = ''): string {
    $level = strtolower(trim((string) $level));
    $message = strtolower(trim((string) $message));

    if (in_array($level, ['success', 'error', 'warning', 'not_sync'], true)) {
        return $level;
    }
    if ($level === 'debug') {
        return 'not_sync';
    }
    if (strpos($message, 'skipped') !== false || strpos($message, 'not found') !== false || strpos($message, 'no longer indexable') !== false) {
        return 'not_sync';
    }
    if ($level === 'info') {
        return 'success';
    }

    return 'warning';
}

function joya_ts_push_admin_activity($level, $message, $context = []) {
    $max = 500;
    $rows = get_option('joya_ts_sync_activity_log', []);
    if (!is_array($rows)) {
        $rows = [];
    }
    $rows[] = [
        'ts' => time(),
        'level' => (string) $level,
        'status' => joya_ts_activity_status($level, $message),
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

function joya_ts_pending_sync_queue(): array {
    $queue = get_option('joya_ts_pending_sync_queue', []);
    return is_array($queue) ? $queue : [];
}

function joya_ts_save_pending_sync_queue(array $queue): void {
    if (count($queue) > 500) {
        uasort($queue, static function ($a, $b) {
            $a_ts = is_array($a) && isset($a['queued_at']) ? (int) $a['queued_at'] : 0;
            $b_ts = is_array($b) && isset($b['queued_at']) ? (int) $b['queued_at'] : 0;
            return $a_ts <=> $b_ts;
        });
        $queue = array_slice($queue, -500, null, true);
    }
    update_option('joya_ts_pending_sync_queue', $queue, false);
}

function joya_ts_queue_pending_sync($product_id, string $reason = 'update'): void {
    $product_id = joya_ts_normalize_sync_id($product_id);
    if ($product_id <= 0) {
        return;
    }

    $queue = joya_ts_pending_sync_queue();
    $key = (string) $product_id;
    $existing = isset($queue[$key]) && is_array($queue[$key]) ? $queue[$key] : [];

    $queue[$key] = [
        'product_id' => $product_id,
        'queued_at' => isset($existing['queued_at']) ? (int) $existing['queued_at'] : time(),
        'last_queued_at' => time(),
        'attempts' => isset($existing['attempts']) ? (int) $existing['attempts'] : 0,
        'reason' => $reason,
    ];

    joya_ts_save_pending_sync_queue($queue);
}

function joya_ts_remove_pending_sync($product_id): void {
    $product_id = joya_ts_normalize_sync_id($product_id);
    if ($product_id <= 0) {
        return;
    }

    $queue = joya_ts_pending_sync_queue();
    $key = (string) $product_id;
    if (isset($queue[$key])) {
        unset($queue[$key]);
        joya_ts_save_pending_sync_queue($queue);
    }
}

function joya_ts_run_interval_queue(): void {
    $queue = joya_ts_pending_sync_queue();
    if (empty($queue)) {
        return;
    }

    $processed = 0;
    foreach ($queue as $key => $row) {
        if ($processed >= 25) {
            break;
        }

        $product_id = is_array($row) && isset($row['product_id']) ? absint($row['product_id']) : absint($key);
        if ($product_id <= 0) {
            unset($queue[$key]);
            continue;
        }

        if (!joya_ts_product_is_indexable($product_id)) {
            joya_ts_log_with_activity('not_sync', 'queued sync became delete: product no longer indexable', [
                'product_id' => $product_id,
            ]);
            joya_ts_delete_index_docs_for_post($product_id, (string) get_post_type($product_id));
            unset($queue[$key]);
            $processed++;
            continue;
        }

        $queue[$key]['attempts'] = isset($queue[$key]['attempts']) ? ((int) $queue[$key]['attempts']) + 1 : 1;
        $queue[$key]['last_attempt_at'] = time();
        joya_ts_save_pending_sync_queue($queue);

        $ok = joya_ts_call_sync_endpoint($product_id);
        if ($ok) {
            unset($queue[$key]);
        }

        $processed++;
    }

    joya_ts_save_pending_sync_queue($queue);
}

add_filter('cron_schedules', function ($schedules) {
    if (!isset($schedules['joya_ts_ten_minutes'])) {
        $schedules['joya_ts_ten_minutes'] = [
            'interval' => 10 * MINUTE_IN_SECONDS,
            'display' => __('Every 10 minutes (Joya Typesense)', 'joya-typesense-woo'),
        ];
    }
    return $schedules;
});

function joya_ts_ensure_interval_queue_event(): void {
    if (!wp_next_scheduled('joya_ts_run_interval_queue')) {
        wp_schedule_event(time() + (10 * MINUTE_IN_SECONDS), 'joya_ts_ten_minutes', 'joya_ts_run_interval_queue');
    }
}

add_action('init', 'joya_ts_ensure_interval_queue_event');
add_action('joya_ts_run_interval_queue', 'joya_ts_run_interval_queue');

if (defined('JOYA_TYPESENSE_WOO_PLUGIN_FILE')) {
    register_activation_hook(JOYA_TYPESENSE_WOO_PLUGIN_FILE, 'joya_ts_ensure_interval_queue_event');
    register_deactivation_hook(JOYA_TYPESENSE_WOO_PLUGIN_FILE, function (): void {
        wp_clear_scheduled_hook('joya_ts_run_interval_queue');
    });
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

/**
 * POST to Next.js Typesense sync. Returns true on HTTP 2xx.
 *
 * @param int $product_id Any product or variation id (normalized to parent for Typesense).
 */
function joya_ts_call_sync_endpoint($product_id): bool {
    $product_id = joya_ts_normalize_sync_id($product_id);
    if ($product_id <= 0) {
        joya_ts_log_with_activity('debug', 'sync skipped: invalid product id', ['product_id' => $product_id]);
        return false;
    }
    $base = joya_ts_sync_base_url();
    $secret = joya_ts_sync_secret();
    if ($base === '' || $secret === '') {
        joya_ts_log_with_activity('warning', 'sync skipped: missing base/secret', [
            'has_base' => $base !== '',
            'has_secret' => $secret !== '',
            'product_id' => $product_id,
        ]);
        return false;
    }

    // Always block until Next.js finishes the Typesense import. Non-blocking calls were often cut short
    // when the PHP worker exited (especially under WP-Cron / pseudo-cron), leaving stale prices in search.
    $res = wp_remote_post($base . '/api/typesense/search/sync', [
        'timeout' => 45,
        'blocking' => true,
        'headers' => joya_ts_merge_next_api_headers([
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $secret,
        ]),
        'body' => wp_json_encode(['product_id' => $product_id]),
    ]);
    if (is_wp_error($res)) {
        joya_ts_log_with_activity('error', 'sync request failed', [
            'product_id' => $product_id,
            'error' => $res->get_error_message(),
        ]);
        return false;
    }
    $code = (int) wp_remote_retrieve_response_code($res);
    if ($code < 200 || $code >= 300) {
        $body = (string) wp_remote_retrieve_body($res);
        $ctx = [
            'product_id' => $product_id,
            'status' => $code,
            'body_preview' => substr($body, 0, 500),
        ];
        if (
            stripos($body, 'Security Checkpoint') !== false
            || stripos($body, 'vercel security checkpoint') !== false
        ) {
            $ctx['hint'] = 'Vercel returned a browser checkpoint, not your API. Enable Protection Bypass for Automation in the Vercel project and set the same value as VERCEL_PROTECTION_BYPASS_SECRET (or env VERCEL_AUTOMATION_BYPASS_SECRET) in wp-config.php.';
        }
        joya_ts_log_with_activity('error', 'sync HTTP error', $ctx);
        return false;
    }
    joya_ts_remove_pending_sync($product_id);
    joya_ts_log_with_activity('success', 'sync request completed', ['product_id' => $product_id]);
    return true;
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
        'timeout' => 15,
        'blocking' => true,
        'headers' => joya_ts_merge_next_api_headers([
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $secret,
        ]),
    ]);
    if (is_wp_error($res)) {
        joya_ts_log_with_activity('error', 'delete request failed', [
            'id' => $id,
            'error' => $res->get_error_message(),
        ]);
        return;
    }

    $code = (int) wp_remote_retrieve_response_code($res);
    if ($code < 200 || $code >= 300) {
        joya_ts_log_with_activity('error', 'delete HTTP error', [
            'id' => $id,
            'status' => $code,
            'body_preview' => substr((string) wp_remote_retrieve_body($res), 0, 500),
        ]);
        return;
    }

    joya_ts_log_with_activity('success', 'delete request completed', ['id' => $id]);
}

/**
 * Resolve manual sync input to a product or variation post ID.
 * Accepts a numeric string (post ID) or a WooCommerce SKU (simple, variable parent, or variation).
 *
 * @param mixed $raw Raw POST value or CLI input.
 * @return int Post ID or 0.
 */
function joya_ts_resolve_manual_sync_post_id($raw) {
    if (is_int($raw) || is_float($raw)) {
        $raw = (string) (int) $raw;
    } elseif (!is_string($raw)) {
        return 0;
    }
    $raw = trim($raw);
    if ($raw === '') {
        return 0;
    }
    if (preg_match('/^\d+$/', $raw)) {
        return absint($raw);
    }
    if (!class_exists('\WC_Data_Store')) {
        return 0;
    }
    try {
        $store = \WC_Data_Store::load('product');
        if (!is_object($store) || !method_exists($store, 'get_product_id_by_sku')) {
            return 0;
        }
        $found = (int) $store->get_product_id_by_sku($raw);

        return $found > 0 ? $found : 0;
    } catch (\Exception $e) {
        return 0;
    }
}

/**
 * Admin / CLI: run sync immediately, bypassing per-request dedupe and short transient lock.
 *
 * @param int|string $raw_input Product/variation ID (digits only) or SKU.
 * @return array{ok:bool,message:string,normalized_id:int}
 */
function joya_ts_manual_sync_product($raw_input): array {
    $raw_id = joya_ts_resolve_manual_sync_post_id($raw_input);
    if ($raw_id <= 0) {
        $hint = is_string($raw_input) ? trim($raw_input) : '';
        if ($hint !== '' && !preg_match('/^\d+$/', $hint)) {
            return [
                'ok' => false,
                'message' => sprintf(
                    /* translators: %s: SKU entered by admin */
                    __('No product or variation found with SKU "%s".', 'joya-typesense-woo'),
                    $hint
                ),
                'normalized_id' => 0,
            ];
        }

        return ['ok' => false, 'message' => __('Enter a valid product or variation ID, or a SKU that exists in WooCommerce.', 'joya-typesense-woo'), 'normalized_id' => 0];
    }
    $pt = get_post_type($raw_id);
    if (!joya_ts_is_supported_post_type((string) $pt)) {
        return ['ok' => false, 'message' => __('That post is not a WooCommerce product or variation.', 'joya-typesense-woo'), 'normalized_id' => 0];
    }
    $normalized = joya_ts_normalize_sync_id($raw_id);
    joya_ts_log_with_activity('info', 'manual sync started', ['raw_id' => $raw_id, 'normalized_parent_id' => $normalized]);
    $ok = joya_ts_call_sync_endpoint($raw_id);
    if ($ok) {
        return [
            'ok' => true,
            'message' => sprintf(
                /* translators: 1: raw id, 2: normalized parent id sent to Next */
                __('Typesense sync finished for #%1$d (index uses parent product #%2$d).', 'joya-typesense-woo'),
                $raw_id,
                $normalized
            ),
            'normalized_id' => $normalized,
        ];
    }
    return [
        'ok' => false,
        'message' => __('Sync failed — check the activity log below for HTTP or configuration errors.', 'joya-typesense-woo'),
        'normalized_id' => $normalized,
    ];
}

function joya_ts_product_is_indexable($product_id): bool {
    $product = wc_get_product(absint($product_id));
    if (!$product instanceof \WC_Product) {
        return false;
    }
    return $product->get_status() === 'publish' && $product->is_in_stock();
}

function joya_ts_run_queued_syncs(): void {
    $queued = isset($GLOBALS['joya_ts_queued_sync_ids']) && is_array($GLOBALS['joya_ts_queued_sync_ids'])
        ? array_keys($GLOBALS['joya_ts_queued_sync_ids'])
        : [];

    unset($GLOBALS['joya_ts_queued_sync_ids']);

    foreach ($queued as $product_id) {
        $pid = absint($product_id);
        if ($pid <= 0) {
            continue;
        }
        if (!joya_ts_product_is_indexable($pid)) {
            $post_type = (string) get_post_type($pid);
            joya_ts_log_with_activity('not_sync', 'queued sync became delete: product no longer indexable', [
                'product_id' => $pid,
                'post_type' => $post_type,
            ]);
            if (joya_ts_is_supported_post_type($post_type)) {
                joya_ts_delete_index_docs_for_post($pid, $post_type);
            }
            joya_ts_remove_pending_sync($pid);
            continue;
        }
        joya_ts_log_with_activity('debug', 'running queued sync', [
            'product_id' => $pid,
        ]);
        if (joya_ts_call_sync_endpoint($pid)) {
            joya_ts_remove_pending_sync($pid);
        }
    }
}

function joya_ts_schedule_sync($product_id) {
    if (defined('WP_IMPORTING') && WP_IMPORTING) {
        return;
    }
    $normalized_id = joya_ts_normalize_sync_id($product_id);
    if ($normalized_id <= 0) {
        joya_ts_log_with_activity('not_sync', 'schedule skipped: invalid normalized id', [
            'product_id' => $product_id,
            'normalized_id' => $normalized_id,
        ]);
        return;
    }
    joya_ts_queue_pending_sync($normalized_id, 'product_changed');
    static $queued_in_request = [];
    static $logged_dedupe_skip = [];
    static $registered_shutdown = false;
    if (isset($queued_in_request[$normalized_id])) {
        // Many variation/meta hooks share one parent sync; log at most once per product per request.
        if (!isset($logged_dedupe_skip[$normalized_id])) {
            $logged_dedupe_skip[$normalized_id] = true;
            joya_ts_log_with_activity('debug', 'sync skipped: already queued in this request', [
                'product_id' => $normalized_id,
            ]);
        }
        return;
    }

    // WooCommerce fires meta hooks while a product is still being saved. Queue until shutdown so the
    // feed endpoint reads the final product/variation state instead of a partially-written snapshot.
    $queued_in_request[$normalized_id] = true;
    if (!isset($GLOBALS['joya_ts_queued_sync_ids']) || !is_array($GLOBALS['joya_ts_queued_sync_ids'])) {
        $GLOBALS['joya_ts_queued_sync_ids'] = [];
    }
    $GLOBALS['joya_ts_queued_sync_ids'][$normalized_id] = true;

    if (!$registered_shutdown) {
        $registered_shutdown = true;
        add_action('shutdown', 'joya_ts_run_queued_syncs', 20);
    }

    joya_ts_log_with_activity('debug', 'queued sync', [
        'product_id' => $normalized_id,
    ]);
}

/**
 * Delete product + child variation documents when a parent product leaves publish.
 * For variation posts, delete only the variation document id.
 */
function joya_ts_delete_index_docs_for_post($post_id, $post_type) {
    $post_id = absint($post_id);
    if ($post_id <= 0) return;

    if ((string) $post_type === 'product') {
        joya_ts_call_delete_endpoint($post_id);
        $product = wc_get_product($post_id);
        if ($product instanceof \WC_Product_Variable) {
            foreach ($product->get_children() as $variation_id) {
                joya_ts_call_delete_endpoint((int) $variation_id);
            }
        }
        return;
    }

    if ((string) $post_type === 'product_variation') {
        joya_ts_call_delete_endpoint($post_id);
    }
}

function joya_ts_stock_status_is_indexable($stock_status): bool {
    return strtolower(trim((string) $stock_status)) === 'instock';
}

function joya_ts_product_stock_status($product_id, $fallback = null): string {
    if ($fallback !== null && trim((string) $fallback) !== '') {
        return strtolower(trim((string) $fallback));
    }
    $product = wc_get_product(absint($product_id));
    if ($product instanceof \WC_Product) {
        return strtolower(trim((string) $product->get_stock_status()));
    }
    return '';
}

function joya_ts_handle_stock_status_change($product_id, $stock_status = null): void {
    if (defined('WP_IMPORTING') && WP_IMPORTING) {
        return;
    }

    $product_id = absint($product_id);
    if ($product_id <= 0) {
        return;
    }

    $post_type = (string) get_post_type($product_id);
    if (!joya_ts_is_supported_post_type($post_type)) {
        return;
    }

    $status = joya_ts_product_stock_status($product_id, $stock_status);
    if ($status !== '' && !joya_ts_stock_status_is_indexable($status)) {
        joya_ts_log_with_activity('debug', 'stock status removed from index', [
            'product_id' => $product_id,
            'post_type' => $post_type,
            'stock_status' => $status,
        ]);
        joya_ts_delete_index_docs_for_post($product_id, $post_type);

        if ($post_type === 'product_variation') {
            $parent_id = (int) wp_get_post_parent_id($product_id);
            if ($parent_id > 0) {
                joya_ts_schedule_sync($parent_id);
            }
        }
        return;
    }

    joya_ts_schedule_sync($product_id);
}

add_action('joya_ts_deferred_sync_single', function ($product_id) {
    $pid = (int) $product_id;
    joya_ts_log_with_activity('debug', 'running deferred sync', ['product_id' => $pid]);
    joya_ts_call_sync_endpoint($pid);
}, 10, 1);

// Priority 999: run after WooCommerce has written variation / product meta (earlier save_post runs can see stale prices).
add_action('save_post', function ($post_id, $post, $update) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
        return;
    }
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
}, 999, 3);

/**
 * Meta keys that affect catalogue/search when changed outside a full product save.
 * Attribute keys on variations are attribute_*.
 */
function joya_ts_meta_key_triggers_typesense_sync(string $meta_key): bool {
    $key = (string) $meta_key;
    if ($key === '') {
        return false;
    }
    /** @var list<string> */
    static $exact = null;
    if ($exact === null) {
        $exact = [
            '_sku',
            '_global_unique_id',
            '_regular_price',
            '_sale_price',
            '_price',
            '_stock',
            '_stock_status',
            '_manage_stock',
            '_backorders',
            '_low_stock_amount',
            '_tax_status',
            '_tax_class',
            '_weight',
            '_length',
            '_width',
            '_height',
            '_virtual',
            '_downloadable',
            '_sold_individually',
            '_download_limit',
            '_download_expiry',
            '_thumbnail_id',
            '_product_image_gallery',
            '_product_attributes',
            '_default_attributes',
            '_downloadable_files',
            '_children',
            '_product_version',
            '_variation_description',
            '_wc_average_rating',
            '_wc_review_count',
            '_wc_rating_count',
        ];
        $exact = apply_filters('joya_ts_sync_meta_keys', $exact);
    }
    if (in_array($key, $exact, true)) {
        return true;
    }
    if (strpos($key, 'attribute_') === 0) {
        return true;
    }
    // Ignore editor/session noise and order-attribution plugin meta.
    if (in_array($key, ['_edit_lock', '_edit_last'], true)) {
        return false;
    }
    if (stripos($key, 'order_attribution') !== false) {
        return false;
    }
    return (bool) apply_filters('joya_ts_meta_key_triggers_sync', false, $key);
}

/**
 * Price / image / attributes / etc. can change without save_post (imports, REST, bulk tools).
 *
 * @param mixed $meta_id_or_ids int for updated/added, array<int> for deleted_post_meta
 */
function joya_ts_meta_change_maybe_sync($meta_id_or_ids, $object_id, $meta_key, $_meta_value): void {
    if (defined('WP_IMPORTING') && WP_IMPORTING) {
        return;
    }
    $meta_key = (string) $meta_key;
    if (!joya_ts_meta_key_triggers_typesense_sync($meta_key)) {
        return;
    }
    $object_id = (int) $object_id;
    if ($object_id <= 0) {
        return;
    }
    $pt = get_post_type($object_id);
    if ($pt === 'product_variation' || $pt === 'product') {
        if ($meta_key === '_stock_status') {
            joya_ts_handle_stock_status_change($object_id, $_meta_value);
            return;
        }
        joya_ts_schedule_sync($object_id);
    }
}

add_action('updated_post_meta', 'joya_ts_meta_change_maybe_sync', 99, 4);
add_action('added_post_meta', 'joya_ts_meta_change_maybe_sync', 99, 4);
add_action('deleted_post_meta', 'joya_ts_meta_change_maybe_sync', 99, 4);

add_action('woocommerce_update_product', function ($product_id) {
    joya_ts_schedule_sync((int) $product_id);
}, 20, 1);

add_action('woocommerce_new_product', function ($product_id) {
    joya_ts_schedule_sync((int) $product_id);
}, 20, 1);

/**
 * Runs after WooCommerce persists the product object (CRUD, most field updates).
 */
add_action('woocommerce_after_product_object_save', function ($product, $data_store) {
    if (defined('WP_IMPORTING') && WP_IMPORTING) {
        return;
    }
    if (!$product instanceof \WC_Product) {
        return;
    }
    joya_ts_schedule_sync((int) $product->get_id());
}, 99, 2);

add_action('woocommerce_product_set_stock_status', function ($product_id, $stock_status = null) {
    joya_ts_handle_stock_status_change((int) $product_id, $stock_status);
}, 20, 2);

add_action('woocommerce_variation_set_stock_status', function ($variation_id, $stock_status = null) {
    joya_ts_handle_stock_status_change((int) $variation_id, $stock_status);
}, 20, 2);

/** Quantity-only updates (imports, POS) may not always go through stock_status hooks. */
add_action('woocommerce_product_set_stock', function ($product) {
    if ($product instanceof \WC_Product) {
        joya_ts_schedule_sync((int) $product->get_id());
    }
}, 20, 1);

add_action('woocommerce_variation_set_stock', function ($product) {
    if ($product instanceof \WC_Product) {
        joya_ts_schedule_sync((int) $product->get_id());
    }
}, 20, 1);

/** Variation bulk / quick-edit paths sometimes skip generic save_post ordering; ensure reindex after price changes. */
add_action('woocommerce_save_product_variation', function ($variation_id) {
    joya_ts_schedule_sync((int) $variation_id);
}, 25, 1);

/**
 * Categories, tags, brands, and attribute terms assigned to a product or variation.
 */
add_action('set_object_terms', function ($object_id, $terms, $tt_ids, $taxonomy) {
    if (defined('WP_IMPORTING') && WP_IMPORTING) {
        return;
    }
    $taxonomy = (string) $taxonomy;
    $watch = ['product_cat', 'product_tag', 'product_brand'];
    $watch = apply_filters('joya_ts_product_term_taxonomies', $watch);
    $is_pa = strpos($taxonomy, 'pa_') === 0;
    if (!in_array($taxonomy, $watch, true) && !$is_pa) {
        return;
    }
    $object_id = (int) $object_id;
    if ($object_id <= 0) {
        return;
    }
    $pt = get_post_type($object_id);
    if ($pt === 'product') {
        joya_ts_schedule_sync($object_id);
        return;
    }
    if ($pt === 'product_variation') {
        $parent_id = (int) wp_get_post_parent_id($object_id);
        if ($parent_id > 0) {
            joya_ts_schedule_sync($parent_id);
        }
    }
}, 99, 4);

/**
 * Explicit status transitions (publish <-> non-publish) for products + variations.
 * This closes edge cases where status changes do not flow through normal save hooks.
 */
add_action('transition_post_status', function ($new_status, $old_status, $post) {
    if (!$post || !joya_ts_is_supported_post_type($post->post_type)) {
        return;
    }
    if ($new_status === $old_status) {
        return;
    }

    $post_id = (int) $post->ID;
    joya_ts_log_with_activity('debug', 'transition_post_status trigger', [
        'post_id' => $post_id,
        'post_type' => (string) $post->post_type,
        'old_status' => (string) $old_status,
        'new_status' => (string) $new_status,
    ]);

    if ($new_status === 'publish') {
        joya_ts_schedule_sync($post_id);
        return;
    }

    if ($old_status === 'publish' && $new_status !== 'publish') {
        joya_ts_delete_index_docs_for_post($post_id, (string) $post->post_type);
        if ((string) $post->post_type === 'product_variation') {
            $parent_id = (int) wp_get_post_parent_id($post_id);
            if ($parent_id > 0) {
                joya_ts_schedule_sync($parent_id);
            }
        }
    }
}, 20, 3);

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
        'Typesense sync',
        'Typesense sync',
        joya_ts_admin_capability(),
        'joya-typesense-sync-activity',
        'joya_ts_render_activity_page'
    );
});

function joya_ts_render_field_mapping_table(): void {
    $schema = joya_ts_schema_fields();
    $mappings = joya_ts_get_field_mappings();
    $sources = joya_ts_field_mapping_sources();

    echo '<div class="card" style="max-width:72rem;margin:1rem 0;padding:1rem 1.25rem;">';
    echo '<h2 style="margin-top:0;">' . esc_html__('Field mapping', 'joya-typesense-woo') . '</h2>';
    echo '<p class="description" style="margin-top:0;">';
    echo esc_html__(
        'These fields match the Typesense products_updated collection. Required identifiers, type, price, parent_id, and updated_at should normally stay on computed WooCommerce values.',
        'joya-typesense-woo'
    );
    echo '</p>';
    echo '<form method="post" action="">';
    wp_nonce_field('joya_ts_save_field_mappings_action', 'joya_ts_save_field_mappings_nonce');
    echo '<table class="widefat striped" style="margin-top:0.75rem;">';
    echo '<thead><tr>';
    echo '<th style="width:210px;">' . esc_html__('Typesense field', 'joya-typesense-woo') . '</th>';
    echo '<th style="width:120px;">' . esc_html__('Type', 'joya-typesense-woo') . '</th>';
    echo '<th style="width:260px;">' . esc_html__('Source', 'joya-typesense-woo') . '</th>';
    echo '<th>' . esc_html__('Source key', 'joya-typesense-woo') . '</th>';
    echo '</tr></thead><tbody>';

    foreach ($schema as $field => $meta) {
        $mapping = isset($mappings[$field]) && is_array($mappings[$field]) ? $mappings[$field] : ['source' => 'core', 'key' => ''];
        $selected_source = isset($mapping['source']) ? (string) $mapping['source'] : 'core';
        $source_key = isset($mapping['key']) ? (string) $mapping['key'] : '';
        $required = !empty($meta['required']);

        echo '<tr>';
        echo '<td><code>' . esc_html($field) . '</code><br><span class="description">' . esc_html((string) $meta['label']) . ($required ? ' · ' . esc_html__('required', 'joya-typesense-woo') : '') . '</span></td>';
        echo '<td><code>' . esc_html((string) $meta['type']) . '</code></td>';
        echo '<td><select name="joya_ts_field_mapping[' . esc_attr($field) . '][source]">';
        foreach ($sources as $source => $label) {
            if ($required && $source === 'none') {
                continue;
            }
            echo '<option value="' . esc_attr($source) . '"' . selected($selected_source, $source, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select></td>';
        echo '<td><input type="text" class="regular-text" name="joya_ts_field_mapping[' . esc_attr($field) . '][key]" value="' . esc_attr($source_key) . '" placeholder="' . esc_attr__('meta key, taxonomy, or attribute name', 'joya-typesense-woo') . '" /></td>';
        echo '</tr>';
    }

    echo '</tbody></table>';
    echo '<p style="display:flex;gap:0.5rem;align-items:center;">';
    echo '<button type="submit" class="button button-primary" name="joya_ts_save_field_mappings" value="1">' . esc_html__('Save field mapping', 'joya-typesense-woo') . '</button>';
    echo '<button type="submit" class="button" name="joya_ts_reset_field_mappings" value="1">' . esc_html__('Reset defaults', 'joya-typesense-woo') . '</button>';
    echo '</p>';
    echo '</form>';
    echo '</div>';
}

function joya_ts_render_activity_page() {
    if (!current_user_can(joya_ts_admin_capability())) {
        wp_die(esc_html__('You do not have permission to view this page.', 'joya'));
    }

    $missing_base = joya_ts_sync_base_url() === '';
    $missing_secret = joya_ts_sync_secret() === '';
    if ($missing_base || $missing_secret) {
        echo '<div class="notice notice-error"><p><strong>' . esc_html__('Typesense sync is not configured.', 'joya-typesense-woo') . '</strong> ';
        echo esc_html__(
            'This plugin sends product updates to your Next.js site (not straight to Typesense). Add the following to wp-config.php (or set the same names in the server environment):',
            'joya-typesense-woo'
        );
        echo '</p><ul style="list-style:disc;margin-left:1.25em;">';
        if ($missing_base) {
            echo '<li><code>define( \'TYPESENSE_SYNC_BASE_URL\', \'https://your-next-site.com\' );</code> ';
            echo esc_html__('or', 'joya-typesense-woo');
            echo ' <code>JOYA_NEXT_API_BASE</code></li>';
        }
        if ($missing_secret) {
            echo '<li><code>define( \'TYPESENSE_SYNC_SECRET\', \'same-value-as-next-env\' );</code> ';
            echo esc_html__('Must match', 'joya-typesense-woo');
            echo ' <code>TYPESENSE_SYNC_SECRET</code> ';
            echo esc_html__('in Next.js.', 'joya-typesense-woo');
            echo ' ' . esc_html__('Optional shared fallback:', 'joya-typesense-woo') . ' <code>SYNC_SECRET</code></li>';
        }
        echo '</ul><p class="description">';
        echo esc_html__(
            'This is separate from Typesense Cloud host/API keys (those are only on the Next server). After saving wp-config.php, try manual sync again.',
            'joya-typesense-woo'
        );
        echo '</p></div>';
    }

    if (isset($_POST['joya_ts_manual_sync']) && isset($_POST['joya_ts_manual_product_id'])) {
        check_admin_referer('joya_ts_manual_sync_action', 'joya_ts_manual_sync_nonce');
        $pid_raw = isset($_POST['joya_ts_manual_product_id']) ? wp_unslash($_POST['joya_ts_manual_product_id']) : '';
        $pid_raw = is_string($pid_raw) ? trim($pid_raw) : '';
        $result = joya_ts_manual_sync_product($pid_raw);
        if ($result['ok']) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($result['message']) . '</p></div>';
        } else {
            echo '<div class="notice notice-error is-dismissible"><p>' . esc_html($result['message']) . '</p></div>';
        }
    }

    if (isset($_POST['joya_ts_save_field_mappings']) && isset($_POST['joya_ts_field_mapping'])) {
        check_admin_referer('joya_ts_save_field_mappings_action', 'joya_ts_save_field_mappings_nonce');
        update_option('joya_ts_field_mappings', joya_ts_sanitize_field_mappings(wp_unslash($_POST['joya_ts_field_mapping'])), false);
        joya_ts_log_with_activity('success', 'field mappings saved', ['user_id' => get_current_user_id()]);
        echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Typesense field mapping saved.', 'joya-typesense-woo') . '</p></div>';
    }

    if (isset($_POST['joya_ts_reset_field_mappings'])) {
        check_admin_referer('joya_ts_save_field_mappings_action', 'joya_ts_save_field_mappings_nonce');
        delete_option('joya_ts_field_mappings');
        joya_ts_log_with_activity('success', 'field mappings reset to defaults', ['user_id' => get_current_user_id()]);
        echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Typesense field mapping reset to defaults.', 'joya-typesense-woo') . '</p></div>';
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
    $all_rows = $rows;
    $log_statuses = [
        'all' => __('All', 'joya-typesense-woo'),
        'success' => __('Success', 'joya-typesense-woo'),
        'error' => __('Error', 'joya-typesense-woo'),
        'warning' => __('Warning', 'joya-typesense-woo'),
        'not_sync' => __('Not sync', 'joya-typesense-woo'),
    ];
    $status_filter = isset($_GET['joya_ts_log_status']) ? sanitize_key((string) wp_unslash($_GET['joya_ts_log_status'])) : 'all';
    if (!isset($log_statuses[$status_filter])) {
        $status_filter = 'all';
    }
    $status_counts = array_fill_keys(array_keys($log_statuses), 0);
    $status_counts['all'] = count($all_rows);
    foreach ($all_rows as $row) {
        $status = isset($row['status'])
            ? sanitize_key((string) $row['status'])
            : joya_ts_activity_status($row['level'] ?? '', $row['message'] ?? '');
        if (isset($status_counts[$status])) {
            $status_counts[$status]++;
        }
    }
    if ($status_filter !== 'all') {
        $rows = array_values(array_filter($all_rows, static function ($row) use ($status_filter) {
            $status = isset($row['status'])
                ? sanitize_key((string) $row['status'])
                : joya_ts_activity_status($row['level'] ?? '', $row['message'] ?? '');
            return $status === $status_filter;
        }));
    }
    $pending_queue = joya_ts_pending_sync_queue();

    echo '<div class="wrap">';
    echo '<h1>' . esc_html__('Typesense sync', 'joya-typesense-woo') . '</h1>';
    echo '<p>' . esc_html__('Manual sync, field mapping, 10-minute fallback queue, and recent WooCommerce to Next.js Typesense events.', 'joya-typesense-woo') . '</p>';
    echo '<p><strong>' . esc_html__('Pending fallback queue:', 'joya-typesense-woo') . '</strong> ' . esc_html((string) count($pending_queue)) . '</p>';

    echo '<div class="card" style="max-width:42rem;margin:1rem 0;padding:1rem 1.25rem;">';
    echo '<h2 style="margin-top:0;">' . esc_html__('Manual sync', 'joya-typesense-woo') . '</h2>';
    echo '<p class="description" style="margin-top:0;">';
    echo esc_html__(
        'Push one product to Next.js now (blocking request, up to ~45 seconds). Enter the WooCommerce product ID, a variation ID, or a product/variation SKU — the index always refreshes the parent product family.',
        'joya-typesense-woo'
    );
    echo '</p>';
    echo '<form method="post" action="" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:0.75rem;">';
    wp_nonce_field('joya_ts_manual_sync_action', 'joya_ts_manual_sync_nonce');
    echo '<p style="margin:0;">';
    echo '<label for="joya_ts_manual_product_id" class="screen-reader-text">' . esc_html__('Product ID, variation ID, or SKU', 'joya-typesense-woo') . '</label>';
    echo '<input type="text" inputmode="text" autocomplete="off" required name="joya_ts_manual_product_id" id="joya_ts_manual_product_id" class="regular-text" style="min-width:14rem;" placeholder="' . esc_attr__('e.g. 12345 or SKU-ABC', 'joya-typesense-woo') . '" /> ';
    echo '</p>';
    echo '<p style="margin:0;">';
    echo '<button type="submit" class="button button-primary" name="joya_ts_manual_sync" value="1">' . esc_html__('Sync now', 'joya-typesense-woo') . '</button>';
    echo '</p>';
    echo '</form>';
    echo '</div>';

    joya_ts_render_field_mapping_table();

    if (joya_ts_vercel_protection_bypass_secret() === '') {
        echo '<p class="description" style="max-width:48rem;margin:0 0 1rem;">';
        echo esc_html__(
            'If sync fails with HTTP 429 and the activity log shows HTML mentioning “Vercel Security Checkpoint”, your Next deployment is blocking server requests. In Vercel: Project → Settings → Deployment Protection → enable “Protection Bypass for Automation”, copy the secret, then add define( \'VERCEL_PROTECTION_BYPASS_SECRET\', \'…that secret…\' ); to wp-config.php (or set the same value in the PHP environment as VERCEL_AUTOMATION_BYPASS_SECRET).',
            'joya-typesense-woo'
        );
        echo '</p>';
    }

    echo '<h2>' . esc_html__('Activity log', 'joya-typesense-woo') . '</h2>';
    echo '<p class="description">' . esc_html__('Recent automatic sync/delete events. Use the filter to review success, error, warning, or not-sync entries.', 'joya-typesense-woo') . '</p>';
    echo '<style>
        .joya-ts-level{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.5}
        .joya-ts-level-debug{background:#eef2ff;color:#3730a3}
        .joya-ts-level-info{background:#ecfdf5;color:#065f46}
        .joya-ts-level-success{background:#ecfdf5;color:#065f46}
        .joya-ts-level-warning{background:#fffbeb;color:#92400e}
        .joya-ts-level-error{background:#fef2f2;color:#991b1b}
        .joya-ts-level-not_sync{background:#f1f5f9;color:#334155}
        .joya-ts-filter-links{display:flex;flex-wrap:wrap;gap:0.5rem;margin:12px 0}
        .joya-ts-filter-links a{display:inline-flex;gap:0.25rem;align-items:center;text-decoration:none;border:1px solid #c3c4c7;border-radius:999px;padding:4px 10px;background:#fff}
        .joya-ts-filter-links a.is-active{background:#2271b1;border-color:#2271b1;color:#fff}
    </style>';
    echo '<div class="joya-ts-filter-links">';
    foreach ($log_statuses as $status => $label) {
        $url = add_query_arg(
            [
                'page' => 'joya-typesense-sync-activity',
                'joya_ts_log_status' => $status,
            ],
            admin_url('admin.php')
        );
        $active = $status_filter === $status ? ' is-active' : '';
        $count = isset($status_counts[$status]) ? (int) $status_counts[$status] : 0;
        echo '<a class="' . esc_attr(trim($active)) . '" href="' . esc_url($url) . '">' . esc_html($label) . ' <span>(' . esc_html((string) $count) . ')</span></a>';
    }
    echo '</div>';
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
            $status = isset($row['status'])
                ? sanitize_key((string) $row['status'])
                : joya_ts_activity_status($level, $row['message'] ?? '');
            $level_class = 'joya-ts-level-' . sanitize_html_class($status);
            $message = isset($row['message']) ? (string) $row['message'] : '';
            $context = isset($row['context']) && is_array($row['context']) ? $row['context'] : [];
            $context_json = wp_json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            echo '<tr>';
            echo '<td>' . esc_html($ts > 0 ? wp_date('Y-m-d H:i:s', $ts) : '-') . '</td>';
            echo '<td><span class="joya-ts-level ' . esc_attr($level_class) . '">' . esc_html(str_replace('_', ' ', $status)) . '</span></td>';
            echo '<td>' . esc_html($message) . '</td>';
            echo '<td><code style="white-space:pre-wrap;word-break:break-word;">' . esc_html((string) $context_json) . '</code></td>';
            echo '</tr>';
        }
    }

    echo '</tbody></table>';
    echo '</div>';
}
<?php

add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/typesense-products', [
        'methods' => 'GET',
        'callback' => function () {

            $products = wc_get_products([
                'limit' => -1,
                'status' => 'publish', // ✅ ONLY published products
            ]);
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
                $parent_updated = ($modified && method_exists($modified, 'date'))
                    ? (int) strtotime($modified->date('c'))
                    : (int) get_post_modified_time('U', true, $product->get_id(), true);
                if ($parent_updated <= 0) {
                    $parent_updated = time();
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

                    "updated_at" => $parent_updated,
                ];

                // Variation documents: separate ids (variation post ID) so SKU search can return the exact variation;
                // parent_id links back to the parent for group_by and UI rollups.
                foreach ($loaded_variations as $variation) {
                    $attr_map   = joya_ts_variation_attributes_for_typesense($variation);
                    $v_label    = joya_ts_variation_display_label($variation);
                    $var_name   = trim($product->get_name() . ($v_label !== '' ? ' - ' . $v_label : ''));
                    $var_image  = wp_get_attachment_url($variation->get_image_id());
                    if (!$var_image) {
                        $var_image = wp_get_attachment_url($product->get_image_id());
                    }
                    $var_updated = (int) get_post_modified_time('U', true, $variation->get_id(), true);
                    if ($var_updated <= 0) {
                        $var_updated = time();
                    }

                    $var_tax = joya_ts_effective_tax_fields($variation, $product);

                    $data[] = [
                        "id" => (string) $variation->get_id(),
                        "name" => $var_name,
                        "slug" => $product->get_slug(),
                        "type" => "variation",
                        "parent_id" => $parent_id_string,
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
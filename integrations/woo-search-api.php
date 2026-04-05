<?php

add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/typesense-products', [
        'methods' => 'GET',
        'callback' => function () {

            $products = wc_get_products(['limit' => -1]);
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

            foreach ($products as $product) {

                // 🔥 MULTI-SKU LOGIC
                $sku_array = [];

                if ($product->is_type('variable')) {
                    $variations = $product->get_children();

                    foreach ($variations as $variation_id) {
                        $variation = wc_get_product($variation_id);

                        if ($variation && $variation->get_sku()) {
                            $sku_array[] = $variation->get_sku();
                        }
                    }
                }

                if ($product->get_sku()) {
                    $sku_array[] = $product->get_sku();
                }

                $sku_array = array_values(array_unique(array_filter($sku_array)));

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

                $data[] = [
                    "id" => (string)$product->get_id(),
                    "name" => $product->get_name(),
                    "slug" => $product->get_slug(),

                    "sku" => $sku_array,

                    "description" => strip_tags($product->get_description()),

                    // ✅ PRICING
                    "price" => $current_price,        // active price
                    "regular_price" => $regular_price,
                    "sale_price" => $sale_price ?: null, // null if no sale

                    "on_sale" => $product->is_on_sale(),

                    "image" => wp_get_attachment_url($product->get_image_id()),

                    "category" => $category_slugs,
                    "brand" => $brand_slugs,

                    // ✅ NEW FIELD
                    "tags" => $tag_slugs,

                    "in_stock" => $product->is_in_stock()
                ];
            }

            return $data;
        }
    ]);
});
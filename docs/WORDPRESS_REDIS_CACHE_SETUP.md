# 🚀 WordPress Redis Object Cache Setup - Quick Win

## Overview

Installing Redis object cache on WordPress can provide **60-80% performance improvement** for database-heavy operations. This is a quick win that often fixes the majority of performance issues.

---

## Phase 1: Install Redis on Ubuntu VPS

### 1.1 Install Redis Server

```bash
# Update package list
sudo apt-get update

# Install Redis server
sudo apt-get install -y redis-server

# Start Redis service
sudo systemctl start redis-server

# Enable Redis on boot
sudo systemctl enable redis-server

# Verify Redis is running
sudo systemctl status redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG
```

### 1.2 Configure Redis (Optional but Recommended)

```bash
# Edit Redis configuration
sudo nano /etc/redis/redis.conf

# Recommended settings:
# - Set maxmemory (e.g., 256mb for small VPS, 512mb for medium)
# - Set maxmemory-policy to allkeys-lru
# - Bind to localhost only (security)

# After editing, restart Redis
sudo systemctl restart redis-server
```

**Key Configuration Settings:**
```conf
# /etc/redis/redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
bind 127.0.0.1
protected-mode yes
```

### 1.3 Install PHP Redis Extension

```bash
# Check PHP version
php -v

# Install PHP Redis extension (adjust version if needed)
# For PHP 8.1
sudo apt-get install -y php8.1-redis

# For PHP 8.0
sudo apt-get install -y php8.0-redis

# For PHP 8.2
sudo apt-get install -y php8.2-redis

# Verify installation
php -m | grep redis
# Should show: redis

# Restart PHP-FPM
sudo systemctl restart php8.1-fpm  # Adjust version
# or
sudo systemctl restart php-fpm
```

### 1.4 Verify Redis Connection from PHP

```bash
# Create test file
cat > /tmp/redis-test.php << 'EOF'
<?php
$redis = new Redis();
try {
    $redis->connect('127.0.0.1', 6379);
    echo "Redis connection: SUCCESS\n";
    echo "Redis version: " . $redis->info()['redis_version'] . "\n";
} catch (Exception $e) {
    echo "Redis connection: FAILED - " . $e->getMessage() . "\n";
}
EOF

# Run test
php /tmp/redis-test.php

# Clean up
rm /tmp/redis-test.php
```

---

## Phase 2: Install WordPress Redis Object Cache Plugin

### 2.1 Option A: Redis Object Cache (Free)

```bash
# Via WP-CLI (recommended)
wp plugin install redis-cache --activate --allow-root

# Or via WordPress Admin:
# Plugins > Add New > Search "Redis Object Cache" > Install > Activate
```

**Activation Command:**
```bash
# Activate object cache drop-in
wp redis enable --allow-root

# Verify drop-in is created
ls -la /var/www/html/wp-content/object-cache.php
# Should show: object-cache.php -> .../redis-cache/includes/object-cache.php
```

**Verify Installation:**
```bash
# Check plugin status
wp plugin list --status=active --allow-root | grep redis

# Check object cache status
wp redis status --allow-root
```

### 2.2 Option B: Redis Object Cache Pro (Premium)

```bash
# If you have Pro version, install manually:
# 1. Upload plugin files to wp-content/plugins/redis-cache-pro/
# 2. Activate via WP-CLI or Admin

wp plugin activate redis-cache-pro --allow-root
wp redis enable --allow-root
```

**Pro Features:**
- Better performance
- Advanced analytics
- More configuration options

### 2.3 Verify Object Cache is Working

```bash
# Check object cache status
wp redis status --allow-root

# Expected output:
# Status: Connected
# Drop-in: Valid
# Disabled: No
```

**Or via WordPress:**
1. Go to WordPress Admin > Settings > Redis
2. Check status shows "Connected"

---

## Phase 3: Configure Transient Caching for Heavy Endpoints

### 3.1 Identify Heavy Endpoints

Based on your performance audit, identify endpoints that:
- Take > 500ms
- Are called frequently
- Don't change often

**Common Heavy Endpoints:**
- `/wc/v3/products` (with filters)
- `/wc/v3/products/categories`
- `/wc/v3/products/attributes`
- Custom endpoints with complex queries

### 3.2 Add Transient Caching to Custom Endpoints

#### Example 1: Cache Products Endpoint

```php
<?php
/**
 * Cache WooCommerce products endpoint
 * 
 * Add to functions.php or custom plugin
 */

add_filter('woocommerce_rest_prepare_product_object', function($response, $product, $request) {
    // Only cache GET requests
    if ($request->get_method() !== 'GET') {
        return $response;
    }
    
    // Build cache key from request parameters
    $params = $request->get_query_params();
    $cache_key = 'wc_products_' . md5(json_encode($params));
    
    // Try to get from cache
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        return $cached;
    }
    
    // Cache not found - will be set by WooCommerce
    // We'll hook into the response to cache it
    return $response;
}, 10, 3);

// Cache the full products collection response
add_filter('woocommerce_rest_product_object_query', function($args, $request) {
    $params = $request->get_query_params();
    $cache_key = 'wc_products_collection_' . md5(json_encode($params));
    
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        // Return cached data (this is a simplified approach)
        // For full implementation, see below
    }
    
    return $args;
}, 10, 2);
```

#### Example 2: Cache Custom Product Endpoint (Full Implementation)

```php
<?php
/**
 * Cache custom products endpoint with transient
 * 
 * Add to functions.php or custom plugin
 */

add_action('rest_api_init', function() {
    register_rest_route('custom/v1', '/products-cached', array(
        'methods' => 'GET',
        'callback' => 'get_cached_products',
        'permission_callback' => '__return_true',
    ));
});

function get_cached_products($request) {
    // Build cache key from request parameters
    $params = $request->get_query_params();
    $cache_key = 'custom_products_v1_' . md5(json_encode($params));
    
    // Try to get from cache (60 seconds TTL)
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        // Add cache header
        header('X-Cache: HIT');
        return rest_ensure_response($cached);
    }
    
    // Cache miss - fetch data
    $args = array(
        'post_type' => 'product',
        'posts_per_page' => isset($params['per_page']) ? intval($params['per_page']) : 24,
        'post_status' => 'publish',
    );
    
    // Add filters
    if (isset($params['category'])) {
        $args['tax_query'] = array(
            array(
                'taxonomy' => 'product_cat',
                'field' => 'slug',
                'terms' => $params['category'],
            ),
        );
    }
    
    // Expensive query
    $query = new WP_Query($args);
    $products = array();
    
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $product = wc_get_product(get_the_ID());
            $products[] = array(
                'id' => $product->get_id(),
                'name' => $product->get_name(),
                'price' => $product->get_price(),
                'sku' => $product->get_sku(),
                // Add more fields as needed
            );
        }
    }
    
    wp_reset_postdata();
    
    $result = array(
        'products' => $products,
        'total' => $query->found_posts,
    );
    
    // Cache for 5 minutes (300 seconds)
    // Use shorter TTL for frequently changing data
    set_transient($cache_key, $result, 300);
    
    // Add cache header
    header('X-Cache: MISS');
    
    return rest_ensure_response($result);
}
```

#### Example 3: Cache Categories Endpoint

```php
<?php
/**
 * Cache product categories endpoint
 */

add_filter('rest_prepare_product_cat', function($response, $term, $request) {
    // Only cache GET requests
    if ($request->get_method() !== 'GET') {
        return $response;
    }
    
    $params = $request->get_query_params();
    $cache_key = 'wc_categories_' . md5(json_encode($params));
    
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        return $cached;
    }
    
    return $response;
}, 10, 3);

// Cache categories collection
add_action('rest_api_init', function() {
    add_filter('rest_product_cat_query', function($args, $request) {
        $params = $request->get_query_params();
        $cache_key = 'wc_categories_collection_' . md5(json_encode($params));
        
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            // Return cached categories
            // Note: This requires custom implementation
        }
        
        return $args;
    }, 10, 2);
});
```

#### Example 4: Cache User-Assigned Products (Custom Module)

```php
<?php
/**
 * Cache user-assigned products endpoint
 * 
 * For custom module: user_assigned_products
 */

add_action('rest_api_init', function() {
    register_rest_route('custom/v1', '/user-assigned-products', array(
        'methods' => 'GET',
        'callback' => 'get_user_assigned_products_cached',
        'permission_callback' => function($request) {
            return is_user_logged_in();
        },
    ));
});

function get_user_assigned_products_cached($request) {
    $user_id = get_current_user_id();
    $params = $request->get_query_params();
    
    // Build cache key with user ID
    $cache_key = 'user_products_' . $user_id . '_' . md5(json_encode($params));
    
    // Try cache first (5 minutes TTL)
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        header('X-Cache: HIT');
        return rest_ensure_response($cached);
    }
    
    // Cache miss - fetch user-assigned products
    // Replace with your actual query logic
    $products = get_user_meta($user_id, 'assigned_products', true);
    
    if (!$products) {
        // Expensive query to get assigned products
        $products = get_user_assigned_products_query($user_id);
    }
    
    $result = array(
        'user_id' => $user_id,
        'products' => $products,
        'count' => count($products),
    );
    
    // Cache for 5 minutes
    set_transient($cache_key, $result, 300);
    
    header('X-Cache: MISS');
    return rest_ensure_response($result);
}

function get_user_assigned_products_query($user_id) {
    // Your expensive query logic here
    // This is just an example
    $args = array(
        'post_type' => 'product',
        'posts_per_page' => -1,
        'meta_query' => array(
            array(
                'key' => 'assigned_user_id',
                'value' => $user_id,
                'compare' => '=',
            ),
        ),
    );
    
    $query = new WP_Query($args);
    $products = array();
    
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $products[] = get_the_ID();
        }
    }
    
    wp_reset_postdata();
    return $products;
}
```

#### Example 5: Cache Wholesale Pricing (Custom Module)

```php
<?php
/**
 * Cache wholesale pricing endpoint
 * 
 * For custom module: wholesale_pricing
 */

add_action('rest_api_init', function() {
    register_rest_route('custom/v1', '/wholesale-pricing', array(
        'methods' => 'GET',
        'callback' => 'get_wholesale_pricing_cached',
        'permission_callback' => function($request) {
            // Check if user has wholesale access
            return current_user_can('wholesale_customer');
        },
    ));
});

function get_wholesale_pricing_cached($request) {
    $user_id = get_current_user_id();
    $product_id = $request->get_param('product_id');
    
    if (!$product_id) {
        return new WP_Error('missing_product_id', 'Product ID required', array('status' => 400));
    }
    
    // Build cache key
    $cache_key = 'wholesale_price_' . $product_id . '_' . $user_id;
    
    // Try cache (10 minutes TTL - pricing changes less frequently)
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        header('X-Cache: HIT');
        return rest_ensure_response($cached);
    }
    
    // Cache miss - calculate wholesale price
    $wholesale_price = calculate_wholesale_price($product_id, $user_id);
    
    $result = array(
        'product_id' => $product_id,
        'regular_price' => wc_get_product($product_id)->get_regular_price(),
        'wholesale_price' => $wholesale_price,
        'discount' => calculate_discount($product_id, $user_id),
    );
    
    // Cache for 10 minutes (600 seconds)
    set_transient($cache_key, $result, 600);
    
    header('X-Cache: MISS');
    return rest_ensure_response($result);
}

function calculate_wholesale_price($product_id, $user_id) {
    // Your expensive calculation logic here
    // This is just an example
    $base_price = get_post_meta($product_id, '_regular_price', true);
    $user_tier = get_user_meta($user_id, 'wholesale_tier', true);
    
    $discount = 0;
    switch ($user_tier) {
        case 'tier1':
            $discount = 0.10; // 10% off
            break;
        case 'tier2':
            $discount = 0.20; // 20% off
            break;
        case 'tier3':
            $discount = 0.30; // 30% off
            break;
    }
    
    return $base_price * (1 - $discount);
}
```

#### Example 6: Cache Product Bundles (Custom Module)

```php
<?php
/**
 * Cache product bundles endpoint
 * 
 * For custom module: product_bundles
 */

add_action('rest_api_init', function() {
    register_rest_route('custom/v1', '/product-bundles', array(
        'methods' => 'GET',
        'callback' => 'get_product_bundles_cached',
        'permission_callback' => '__return_true',
    ));
});

function get_product_bundles_cached($request) {
    $product_id = $request->get_param('product_id');
    
    if (!$product_id) {
        return new WP_Error('missing_product_id', 'Product ID required', array('status' => 400));
    }
    
    // Build cache key
    $cache_key = 'product_bundles_' . $product_id;
    
    // Try cache (15 minutes TTL - bundles change infrequently)
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        header('X-Cache: HIT');
        return rest_ensure_response($cached);
    }
    
    // Cache miss - fetch bundle data
    $bundle_data = get_product_bundle_data($product_id);
    
    $result = array(
        'product_id' => $product_id,
        'bundles' => $bundle_data,
        'count' => count($bundle_data),
    );
    
    // Cache for 15 minutes (900 seconds)
    set_transient($cache_key, $result, 900);
    
    header('X-Cache: MISS');
    return rest_ensure_response($result);
}

function get_product_bundle_data($product_id) {
    // Your expensive bundle query logic here
    // This is just an example
    $bundles = get_post_meta($product_id, '_product_bundles', true);
    
    if (!$bundles) {
        return array();
    }
    
    $result = array();
    foreach ($bundles as $bundle_id) {
        $product = wc_get_product($bundle_id);
        if ($product) {
            $result[] = array(
                'id' => $bundle_id,
                'name' => $product->get_name(),
                'price' => $product->get_price(),
            );
        }
    }
    
    return $result;
}
```

---

## Phase 4: Cache Invalidation

### 4.1 Invalidate Cache on Product Update

```php
<?php
/**
 * Invalidate product cache when product is updated
 */

add_action('woocommerce_update_product', function($product_id) {
    // Invalidate product cache
    delete_transient('wc_products_collection_*'); // Use wildcard if supported
    delete_transient('product_bundles_' . $product_id);
    
    // Clear all product-related transients
    global $wpdb;
    $wpdb->query($wpdb->prepare(
        "DELETE FROM {$wpdb->options} 
         WHERE option_name LIKE %s 
         AND option_name LIKE %s",
        '_transient_wc_products_%',
        '%' . $product_id . '%'
    ));
}, 10, 1);
```

### 4.2 Invalidate Cache on Order Update

```php
<?php
/**
 * Invalidate cache when order status changes
 */

add_action('woocommerce_order_status_changed', function($order_id, $old_status, $new_status) {
    // Invalidate user-specific caches
    $order = wc_get_order($order_id);
    $user_id = $order->get_user_id();
    
    if ($user_id) {
        delete_transient('user_products_' . $user_id . '_*');
        delete_transient('wholesale_price_*_' . $user_id);
    }
}, 10, 3);
```

---

## Phase 5: Verification & Testing

### 5.1 Test Redis Object Cache

```bash
# Check Redis is storing WordPress data
redis-cli

# In Redis CLI:
KEYS *wp_cache*
# Should show WordPress cache keys

# Check a specific key
GET wp_cache:product:123
```

### 5.2 Test Transient Caching

```bash
# Via WP-CLI
wp transient list --allow-root | head -20

# Check specific transient
wp transient get custom_products_v1_abc123 --allow-root
```

### 5.3 Monitor Cache Performance

```bash
# Check Redis memory usage
redis-cli INFO memory

# Check number of keys
redis-cli DBSIZE

# Monitor Redis commands in real-time
redis-cli MONITOR
```

---

## Phase 6: Recommended TTL Values

### Cache Duration Guidelines

```php
// Static data (categories, attributes) - Long cache
set_transient($key, $data, 3600); // 1 hour

// Semi-static data (products, prices) - Medium cache
set_transient($key, $data, 300); // 5 minutes

// Dynamic data (cart, inventory) - Short cache
set_transient($key, $data, 60); // 1 minute

// User-specific data - Medium cache
set_transient($key, $data, 300); // 5 minutes

// Search results - Short cache
set_transient($key, $data, 120); // 2 minutes
```

---

## Expected Performance Improvements

### Before Redis
- Database queries: 50-200 per request
- Average response time: 500-1500ms
- Cache hit rate: 0%

### After Redis Object Cache
- Database queries: 10-50 per request (60-80% reduction)
- Average response time: 200-500ms (50-70% reduction)
- Cache hit rate: 80-90%

### After Transient Caching
- Heavy endpoint latency: 80-95% reduction
- Server load: 50-70% reduction
- Database load: 70-90% reduction

---

## Troubleshooting

### Redis Not Connecting

```bash
# Check Redis is running
sudo systemctl status redis-server

# Check Redis port
netstat -tlnp | grep 6379

# Test connection
redis-cli -h 127.0.0.1 -p 6379 ping
```

### PHP Redis Extension Not Working

```bash
# Check extension is loaded
php -m | grep redis

# Check PHP configuration
php --ini | grep redis

# Restart PHP-FPM
sudo systemctl restart php8.1-fpm
```

### Object Cache Not Working

```bash
# Check drop-in exists
ls -la wp-content/object-cache.php

# Check plugin is active
wp plugin list --status=active --allow-root | grep redis

# Re-enable object cache
wp redis enable --allow-root
```

---

## Next Steps

1. **Install Redis** (15 minutes)
   - Run installation commands
   - Verify Redis is working

2. **Install Plugin** (5 minutes)
   - Install Redis Object Cache plugin
   - Enable object cache drop-in

3. **Add Transients** (1-2 hours)
   - Identify heavy endpoints from audit
   - Add transient caching
   - Test cache hit/miss

4. **Monitor** (ongoing)
   - Check cache hit rates
   - Monitor Redis memory
   - Adjust TTL values as needed

---

## Quick Reference

### Installation Commands

```bash
# Install Redis
sudo apt-get update && sudo apt-get install -y redis-server
sudo systemctl start redis-server && sudo systemctl enable redis-server

# Install PHP Redis
sudo apt-get install -y php8.1-redis
sudo systemctl restart php8.1-fpm

# Install WordPress Plugin
wp plugin install redis-cache --activate --allow-root
wp redis enable --allow-root
```

### Verification Commands

```bash
# Test Redis
redis-cli ping

# Test PHP Redis
php -m | grep redis

# Check WordPress cache
wp redis status --allow-root
```

---

**This is a quick win that typically provides 60-80% performance improvement with minimal effort!**


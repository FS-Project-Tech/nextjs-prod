# 🚀 Redis Object Cache - Quick Start (5 Minutes)

## ⚠️ Important: Run on Linux VPS, Not Windows!

**These commands run on your Linux VPS (WordPress server) via SSH, NOT on your Windows development machine.**

### Step 1: Connect to Your VPS

```bash
# From Windows, SSH into your VPS
ssh username@your-vps-ip
# or
ssh username@your-domain.com
```

### Step 2: One-Command Installation

```bash
# Navigate to your project (if script is there)
cd /var/www/html  # or your WordPress path

# Make script executable and run
chmod +x scripts/install-redis-wordpress.sh
sudo ./scripts/install-redis-wordpress.sh
```

**Or if script is not on VPS, use manual installation (see below).**

**Or manual installation (if script not available):**

```bash
# On your Linux VPS (via SSH)

# 1. Install Redis
sudo apt-get update
sudo apt-get install -y redis-server php8.1-redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 2. Install WordPress Plugin
cd /var/www/html  # Your WordPress path
wp plugin install redis-cache --activate --allow-root
wp redis enable --allow-root

# 3. Verify
redis-cli ping
# Should return: PONG

wp redis status --allow-root
# Should show: Status: Connected
```

---

## Verify Installation

```bash
# Test Redis
redis-cli ping
# Should return: PONG

# Check PHP Redis
php -m | grep redis
# Should show: redis

# Check WordPress cache
wp redis status --allow-root
# Should show: Status: Connected
```

---

## Add Transient Caching (Copy-Paste Ready)

### For Products Endpoint (60 seconds)

```php
$key = 'my_products_v1_' . md5(json_encode($args));
$cached = get_transient($key);
if ($cached !== false) return $cached;

// expensive query here
$result = your_expensive_query();

set_transient($key, $result, 60); // 60 seconds
return $result;
```

### For Products Endpoint (300 seconds / 5 minutes)

```php
$key = 'my_products_v1_' . md5(json_encode($args));
$cached = get_transient($key);
if ($cached !== false) return $cached;

// expensive query here
$result = your_expensive_query();

set_transient($key, $result, 300); // 300 seconds = 5 minutes
return $result;
```

---

## Expected Results

**Before:**
- Response time: 500-1500ms
- Database queries: 50-200 per request

**After:**
- Response time: 200-500ms (50-70% reduction)
- Database queries: 10-50 per request (60-80% reduction)
- Cache hit rate: 80-90%

---

## Full Examples

See `wordpress/transient-cache-examples.php` for complete examples including:
- Products caching
- User-assigned products
- Wholesale pricing
- Product bundles
- Dynamic discounts

---

## Next Steps

1. Run installation script
2. Verify Redis is working
3. Add transient caching to heavy endpoints
4. Monitor cache hit rates
5. Adjust TTL values as needed

**This quick win typically provides 60-80% performance improvement!**


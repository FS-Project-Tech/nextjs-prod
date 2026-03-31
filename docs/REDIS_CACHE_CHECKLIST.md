# ✅ Redis Object Cache Setup Checklist

## Pre-Installation

- [ ] SSH access to WordPress server
- [ ] Root/sudo access
- [ ] WordPress installed
- [ ] WP-CLI installed (optional but recommended)
- [ ] PHP version known (`php -v`)

## Installation Steps

### Step 1: Install Redis Server
- [ ] Run: `sudo apt-get install -y redis-server`
- [ ] Start: `sudo systemctl start redis-server`
- [ ] Enable: `sudo systemctl enable redis-server`
- [ ] Verify: `redis-cli ping` returns `PONG`

### Step 2: Install PHP Redis Extension
- [ ] Detect PHP version: `php -v`
- [ ] Install: `sudo apt-get install -y php8.1-redis` (adjust version)
- [ ] Verify: `php -m | grep redis` shows `redis`
- [ ] Restart PHP-FPM: `sudo systemctl restart php8.1-fpm`

### Step 3: Install WordPress Plugin
- [ ] Install: `wp plugin install redis-cache --activate --allow-root`
- [ ] Enable: `wp redis enable --allow-root`
- [ ] Verify: `wp redis status --allow-root` shows "Connected"

### Step 4: Add Transient Caching
- [ ] Identify heavy endpoints from performance audit
- [ ] Add transient caching to each endpoint
- [ ] Set appropriate TTL values
- [ ] Test cache hit/miss

## Verification

- [ ] Redis server running: `sudo systemctl status redis-server`
- [ ] PHP Redis loaded: `php -m | grep redis`
- [ ] WordPress cache connected: `wp redis status --allow-root`
- [ ] Cache keys in Redis: `redis-cli KEYS "*wp_cache*"`

## Post-Installation

- [ ] Monitor cache hit rates
- [ ] Check Redis memory usage: `redis-cli INFO memory`
- [ ] Adjust TTL values based on data freshness needs
- [ ] Set up cache invalidation hooks
- [ ] Document cache keys for maintenance

## Expected Improvements

- [ ] API latency reduced by 50-70%
- [ ] Database queries reduced by 60-80%
- [ ] Cache hit rate > 80%
- [ ] Server CPU usage reduced by 30-50%

---

**Time to complete: 15-30 minutes**
**Expected improvement: 60-80% performance gain**


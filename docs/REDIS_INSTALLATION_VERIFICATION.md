# ✅ Redis Installation Verification Guide

## Important Note

**These commands run on your Linux VPS (WordPress server), NOT on your Windows development machine.**

Your development machine (Windows) is at: `f:\woocommerce-headless-nextjs`  
Your WordPress server (Linux VPS) is where you'll run these commands via SSH.

---

## Step-by-Step Verification

### 1. SSH into Your WordPress Server

```bash
# From your local machine (Windows), SSH into your VPS
ssh user@your-vps-ip
# or
ssh user@your-domain.com
```

### 2. Make Script Executable (Linux Server)

```bash
# Navigate to your project directory (if you uploaded the script)
cd /path/to/your/project

# Make script executable
chmod +x scripts/install-redis-wordpress.sh

# Or if script is in different location
chmod +x /path/to/install-redis-wordpress.sh
```

### 3. Run Installation Script

```bash
# Run with sudo (requires root access)
sudo ./scripts/install-redis-wordpress.sh

# Or if script is elsewhere
sudo /path/to/install-redis-wordpress.sh
```

**Expected Output:**
```
==========================================
WordPress Redis Object Cache Installation
==========================================

Detected PHP version: 8.1

[1/5] Installing Redis Server...
✓ Redis server is running

[2/5] Configuring Redis...
✓ Redis configured

[3/5] Installing PHP Redis Extension...
✓ PHP Redis extension installed
✓ PHP Redis extension is loaded
✓ PHP-FPM restarted

[4/5] Installing WordPress Redis Object Cache Plugin...
✓ Redis Object Cache is active and connected

[5/5] Testing Installation...
✓ Redis server: OK
✓ PHP Redis extension: OK
✓ WordPress object cache: OK

==========================================
Installation Complete!
==========================================
```

### 4. Verify Installation

#### Check Redis Server

```bash
# Test Redis connection
redis-cli ping
# Expected: PONG

# Check Redis status
sudo systemctl status redis-server
# Should show: active (running)
```

#### Check PHP Redis Extension

```bash
# Verify PHP Redis is loaded
php -m | grep redis
# Expected: redis

# Test PHP Redis connection
php -r "echo (new Redis())->connect('127.0.0.1', 6379) ? 'Connected' : 'Failed';"
# Expected: Connected
```

#### Check WordPress Object Cache

```bash
# Navigate to WordPress directory
cd /var/www/html  # or your WordPress path

# Check Redis Object Cache status
wp redis status --allow-root
# Expected output:
# Status: Connected
# Drop-in: Valid
# Disabled: No

# Check plugin is active
wp plugin list --status=active --allow-root | grep redis
# Expected: redis-cache
```

### 5. Test Cache is Working

```bash
# Check if WordPress is storing data in Redis
redis-cli

# In Redis CLI:
KEYS *wp_cache*
# Should show WordPress cache keys

# Check a specific cache key
GET wp_cache:product:123
# Should show cached data (if exists)

# Exit Redis CLI
exit
```

---

## Troubleshooting

### Issue: "chmod: command not found"

**Cause:** You're on Windows, not Linux server

**Solution:** Run commands on your Linux VPS via SSH, not on Windows

### Issue: "wp: command not found"

**Solution:** Install WP-CLI or use WordPress Admin instead:

1. Go to WordPress Admin > Plugins
2. Search "Redis Object Cache"
3. Install and Activate
4. Go to Settings > Redis
5. Click "Enable Object Cache"

### Issue: "Redis connection failed"

**Check:**
```bash
# Is Redis running?
sudo systemctl status redis-server

# Can you connect?
redis-cli ping

# Check Redis port
netstat -tlnp | grep 6379
```

**Fix:**
```bash
# Start Redis
sudo systemctl start redis-server

# Enable on boot
sudo systemctl enable redis-server
```

### Issue: "PHP Redis extension not found"

**Check:**
```bash
# Is extension installed?
php -m | grep redis

# Check PHP version
php -v
```

**Fix:**
```bash
# Install for your PHP version
sudo apt-get install -y php8.1-redis  # Adjust version

# Restart PHP-FPM
sudo systemctl restart php8.1-fpm
```

### Issue: "WordPress object cache not connected"

**Check:**
```bash
# Is plugin active?
wp plugin list --status=active --allow-root | grep redis

# Is drop-in created?
ls -la wp-content/object-cache.php
```

**Fix:**
```bash
# Re-enable object cache
wp redis enable --allow-root

# Or manually:
# 1. Go to WordPress Admin > Settings > Redis
# 2. Click "Enable Object Cache"
```

---

## Manual Installation (If Script Fails)

### Step 1: Install Redis

```bash
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping  # Should return PONG
```

### Step 2: Install PHP Redis

```bash
# Check PHP version first
php -v

# Install for your version
sudo apt-get install -y php8.1-redis  # or php8.0-redis, php8.2-redis

# Verify
php -m | grep redis

# Restart PHP-FPM
sudo systemctl restart php8.1-fpm
```

### Step 3: Install WordPress Plugin

**Via WP-CLI:**
```bash
cd /var/www/html  # Your WordPress path
wp plugin install redis-cache --activate --allow-root
wp redis enable --allow-root
wp redis status --allow-root
```

**Via WordPress Admin:**
1. Go to Plugins > Add New
2. Search "Redis Object Cache"
3. Install and Activate
4. Go to Settings > Redis
5. Click "Enable Object Cache"

---

## Verification Checklist

- [ ] Redis server running: `redis-cli ping` returns `PONG`
- [ ] PHP Redis loaded: `php -m | grep redis` shows `redis`
- [ ] WordPress plugin active: `wp plugin list | grep redis`
- [ ] Object cache enabled: `wp redis status` shows "Connected"
- [ ] Cache keys in Redis: `redis-cli KEYS "*wp_cache*"` shows keys

---

## Next Steps After Installation

1. **Add Transient Caching**
   - Copy examples from `wordpress/transient-cache-examples.php`
   - Add to your theme's `functions.php` or custom plugin
   - Test cache hit/miss

2. **Monitor Performance**
   ```bash
   # Check Redis memory
   redis-cli INFO memory
   
   # Check cache keys
   redis-cli DBSIZE
   ```

3. **Adjust TTL Values**
   - Based on your data freshness needs
   - Monitor cache hit rates
   - Optimize as needed

---

## Quick Reference

```bash
# Installation
sudo ./scripts/install-redis-wordpress.sh

# Verification
redis-cli ping                    # Should: PONG
php -m | grep redis              # Should: redis
wp redis status --allow-root     # Should: Connected

# Monitoring
redis-cli INFO memory            # Memory usage
redis-cli DBSIZE                # Number of keys
redis-cli MONITOR               # Real-time commands
```

---

**Remember: Run these commands on your Linux VPS, not on Windows!**


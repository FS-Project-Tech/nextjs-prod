#!/bin/bash

###############################################################################
# Install Redis Object Cache for WordPress
#
# This script installs Redis server, PHP Redis extension, and WordPress plugin
# for Redis object caching.
#
# IMPORTANT: Run this on your Linux VPS (WordPress server), NOT on Windows!
#
# Usage:
#   chmod +x scripts/install-redis-wordpress.sh
#   sudo ./scripts/install-redis-wordpress.sh
#
# Requirements:
#   - Ubuntu/Debian server (Linux VPS)
#   - Root/sudo access
#   - WordPress installed
#   - WP-CLI installed (optional - can use WordPress Admin instead)
#
# To run:
#   1. SSH into your VPS: ssh user@your-vps-ip
#   2. Upload this script or clone the repo
#   3. Run: sudo ./scripts/install-redis-wordpress.sh
###############################################################################

set -euo pipefail

echo "=========================================="
echo "WordPress Redis Object Cache Installation"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Detect PHP version
PHP_VERSION=$(php -v | head -1 | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "Detected PHP version: $PHP_VERSION"
echo ""

# Step 1: Install Redis Server
echo "[1/5] Installing Redis Server..."
apt-get update -qq
apt-get install -y redis-server

# Configure Redis
echo "[2/5] Configuring Redis..."
if ! grep -q "maxmemory" /etc/redis/redis.conf; then
    echo "maxmemory 256mb" >> /etc/redis/redis.conf
    echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf
fi

# Start and enable Redis
systemctl start redis-server
systemctl enable redis-server

# Verify Redis
if redis-cli ping | grep -q "PONG"; then
    echo "✓ Redis server is running"
else
    echo "✗ Redis server failed to start"
    exit 1
fi

# Step 2: Install PHP Redis Extension
echo ""
echo "[3/5] Installing PHP Redis Extension..."

# Try to install for detected PHP version
if apt-get install -y "php${PHP_VERSION}-redis" 2>/dev/null; then
    echo "✓ PHP Redis extension installed"
else
    echo "⚠ Could not install php${PHP_VERSION}-redis"
    echo "Trying alternative method..."
    apt-get install -y php-redis || {
        echo "✗ Failed to install PHP Redis extension"
        echo "Please install manually: sudo apt-get install php-redis"
    }
fi

# Verify PHP Redis
if php -m | grep -q redis; then
    echo "✓ PHP Redis extension is loaded"
else
    echo "✗ PHP Redis extension not loaded"
    echo "Please check PHP configuration"
fi

# Restart PHP-FPM
PHP_FPM_SERVICE=$(systemctl list-units --type=service | grep -o 'php[0-9.]*-fpm\|php-fpm' | head -1)
if [ -n "$PHP_FPM_SERVICE" ]; then
    systemctl restart "$PHP_FPM_SERVICE"
    echo "✓ PHP-FPM restarted"
else
    echo "⚠ Could not find PHP-FPM service to restart"
fi

# Step 3: Install WordPress Plugin
echo ""
echo "[4/5] Installing WordPress Redis Object Cache Plugin..."

# Check if WP-CLI is available
if ! command -v wp &> /dev/null; then
    echo "⚠ WP-CLI not found. Please install Redis Object Cache plugin manually:"
    echo "   Plugins > Add New > Search 'Redis Object Cache' > Install > Activate"
    echo "   Then run: wp redis enable --allow-root"
else
    # Get WordPress path (assume current directory or common locations)
    WP_PATH="${WP_PATH:-/var/www/html}"
    
    if [ -f "$WP_PATH/wp-config.php" ]; then
        cd "$WP_PATH"
        wp plugin install redis-cache --activate --allow-root
        wp redis enable --allow-root
        
        # Verify
        if wp redis status --allow-root | grep -q "Connected"; then
            echo "✓ Redis Object Cache is active and connected"
        else
            echo "⚠ Redis Object Cache installed but not connected"
            echo "Check: wp redis status --allow-root"
        fi
    else
        echo "⚠ WordPress not found at $WP_PATH"
        echo "Please run from WordPress root directory or set WP_PATH"
    fi
fi

# Step 4: Test Installation
echo ""
echo "[5/5] Testing Installation..."

# Test Redis connection
if redis-cli ping | grep -q "PONG"; then
    echo "✓ Redis server: OK"
else
    echo "✗ Redis server: FAILED"
fi

# Test PHP Redis
if php -m | grep -q redis; then
    echo "✓ PHP Redis extension: OK"
else
    echo "✗ PHP Redis extension: FAILED"
fi

# Test WordPress cache (if WP-CLI available)
if command -v wp &> /dev/null && [ -f "$WP_PATH/wp-config.php" ]; then
    cd "$WP_PATH"
    if wp redis status --allow-root 2>/dev/null | grep -q "Connected"; then
        echo "✓ WordPress object cache: OK"
    else
        echo "⚠ WordPress object cache: Check status manually"
    fi
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Verify Redis is working: redis-cli ping"
echo "2. Check WordPress cache: wp redis status --allow-root"
echo "3. Add transient caching to heavy endpoints (see docs)"
echo "4. Monitor cache performance"
echo ""


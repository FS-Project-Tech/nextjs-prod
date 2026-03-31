# 🔐 SSH Setup Guide - Running Commands on Your VPS

## Overview

The Redis installation commands need to run on your **Linux VPS** (where WordPress is hosted), not on your Windows development machine.

---

## Step 1: Connect to Your VPS

### From Windows (PowerShell or Command Prompt)

```powershell
# Basic SSH connection
ssh username@your-vps-ip

# Or with domain
ssh username@your-domain.com

# Example
ssh root@192.168.1.100
# or
ssh admin@mysite.com
```

### First Time Connection

You'll see a message like:
```
The authenticity of host '192.168.1.100' can't be established.
Are you sure you want to continue connecting (yes/no)?
```
Type `yes` and press Enter.

### Enter Password

When prompted, enter your VPS password.

---

## Step 2: Upload Script to VPS

### Option A: Using SCP (from Windows)

```powershell
# Upload script to VPS
scp scripts/install-redis-wordpress.sh username@your-vps-ip:/tmp/

# Then SSH and move to project directory
ssh username@your-vps-ip
cd /var/www/html  # or your WordPress path
mv /tmp/install-redis-wordpress.sh scripts/
```

### Option B: Clone Repository on VPS

```bash
# On VPS, clone your repo
cd /var/www/html
git clone your-repo-url .
# or download script directly
wget https://your-repo/scripts/install-redis-wordpress.sh
```

### Option C: Copy-Paste Script Content

```bash
# On VPS, create script file
nano scripts/install-redis-wordpress.sh

# Paste script content, then save (Ctrl+X, Y, Enter)
```

---

## Step 3: Run Installation

```bash
# Make executable
chmod +x scripts/install-redis-wordpress.sh

# Run with sudo
sudo ./scripts/install-redis-wordpress.sh
```

---

## Alternative: Manual Installation (No Script)

If you can't upload the script, run commands manually:

```bash
# 1. Install Redis
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 2. Install PHP Redis
sudo apt-get install -y php8.1-redis  # Adjust version
sudo systemctl restart php8.1-fpm

# 3. Install WordPress Plugin
cd /var/www/html  # Your WordPress path
wp plugin install redis-cache --activate --allow-root
wp redis enable --allow-root

# 4. Verify
redis-cli ping
php -m | grep redis
wp redis status --allow-root
```

---

## Common SSH Issues

### Issue: "Permission denied (publickey)"

**Solution:** Use password authentication or set up SSH keys

```bash
# Use password authentication
ssh -o PreferredAuthentications=password username@your-vps-ip
```

### Issue: "Connection timed out"

**Solution:** 
- Check firewall allows SSH (port 22)
- Verify VPS IP address
- Check if VPS is running

### Issue: "Command not found: chmod"

**Cause:** You're on Windows, not Linux

**Solution:** Run commands on VPS via SSH, not locally

---

## Quick Reference

```bash
# 1. Connect to VPS
ssh username@your-vps-ip

# 2. Navigate to WordPress
cd /var/www/html

# 3. Make script executable
chmod +x scripts/install-redis-wordpress.sh

# 4. Run installation
sudo ./scripts/install-redis-wordpress.sh

# 5. Verify
redis-cli ping
wp redis status --allow-root
```

---

**All commands run on your Linux VPS, not on Windows!**


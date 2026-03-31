# WordPress Plugin Installation Guide

## Custom Auth Bridge Plugin

This plugin bridges WordPress authentication with your Next.js headless frontend.

### Installation

1. **Copy the plugin file:**
   ```bash
   # Copy wp-plugin/custom-auth-bridge.php to your WordPress installation
   cp wp-plugin/custom-auth-bridge.php /path/to/wordpress/wp-content/plugins/custom-auth-bridge/custom-auth-bridge.php
   ```

2. **Activate the plugin:**
   - Go to WordPress Admin → Plugins
   - Find "Custom Auth Bridge for Headless Next.js"
   - Click "Activate"

3. **Configure settings:**
   - Go to WordPress Admin → Settings → Auth Bridge
   - Enter your Next.js frontend URL (e.g., `https://your-nextjs-app.com`)
   - Click "Save Changes"

### Alternative: Environment Variable

You can also set the Next.js URL via environment variable in `wp-config.php`:

```php
define('NEXTJS_FRONTEND_URL', 'https://your-nextjs-app.com');
```

### Features

The plugin provides:

1. **CORS Headers**: Allows requests from your Next.js frontend
2. **Enhanced JWT Response**: Adds customer ID and user metadata to JWT responses
3. **WooCommerce Session Management**: Creates and manages WC session cookies
4. **Custom REST Endpoints**:
   - `/wp-json/custom-auth/v1/validate-token` - Validate JWT tokens
   - `/wp-json/custom-auth/v1/session-info` - Get session information
   - `/wp-json/custom-auth/v1/wc-session` - Create WooCommerce session

### Requirements

- WordPress 5.0+
- WooCommerce 3.0+ (optional, for cart functionality)
- JWT Authentication Plugin (for JWT token support)

### Troubleshooting

**CORS errors:**
- Ensure the Next.js frontend URL is correctly configured
- Check that the plugin is activated
- Verify CORS headers are being sent (check browser Network tab)

**Session not persisting:**
- Ensure cookies are being set (check browser DevTools → Application → Cookies)
- Verify `SameSite` cookie settings match your setup
- Check that `COOKIE_DOMAIN` is correctly set in `wp-config.php`

**JWT validation failing:**
- Ensure JWT Authentication Plugin is installed and activated
- Verify JWT secret key is set in WordPress settings
- Check that tokens are being sent in `Authorization: Bearer <token>` header

### API Endpoints

#### Validate Token
```
POST /wp-json/custom-auth/v1/validate-token
Headers: Authorization: Bearer <token>
```

#### Get Session Info
```
GET /wp-json/custom-auth/v1/session-info
Headers: Authorization: Bearer <token>
```

#### Create WC Session
```
POST /wp-json/custom-auth/v1/wc-session
Headers: Authorization: Bearer <token>
Body: { "customer_id": 123 }
```

### Security Notes

- The plugin adds security headers to all REST API responses
- CORS is restricted to your configured Next.js frontend URL
- Session cookies are HttpOnly and Secure (in production)
- CSRF protection should be handled by your Next.js application


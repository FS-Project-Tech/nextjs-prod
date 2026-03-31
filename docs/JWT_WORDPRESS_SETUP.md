# WordPress JWT Setup for Headless Login

This guide fixes common issues: **"JWT is not configured properly, please contact the admin"**, **login then immediate logout**, and **refresh page = auto logout**.

---

## ⚠️ Refresh = auto logout (most common on new URL / Cloudways)

**Symptom:** You log in successfully, but as soon as you **refresh the page** (F5 or reload), you are logged out.

**Cause:** On refresh, the Next.js app sends your session cookie to its server, which then calls WordPress `POST /wp-json/jwt-auth/v1/token/validate` with `Authorization: Bearer <your-token>`. Many hosts (including **Apache / Cloudways**) **strip the `Authorization` header** before it reaches PHP. WordPress never sees the token, returns 401, and the app clears your session.

**Fix:** Add the **Authorization header pass-through** on your **WordPress** server (Section 2 below). That is the `.htaccess` rule in your WordPress root. Without it, refresh will keep logging you out.

---

## 1. Use a dedicated JWT secret in `wp-config.php`

**Do not** use `AUTH_KEY` (or any WordPress salt) as the JWT secret. Use a **single, long, random string** only for JWT.

Add this in `wp-config.php` in the **"Add any custom values"** section (before *"That's all, stop editing!"*):

```php
// JWT for REST API (headless login) – use a unique random string, not AUTH_KEY
define('JWT_AUTH_SECRET_KEY', 'REPLACE_WITH_LONG_RANDOM_STRING_64_CHARS_OR_MORE');
define('JWT_AUTH_CORS_ENABLE', true);
```

**Generate a secret** (one line, run in terminal):

```bash
openssl rand -base64 64
```

Or use a long random password (letters + numbers, 64+ characters). Paste that value as the string in `JWT_AUTH_SECRET_KEY`.

**Important:**

- Do **not** do: `define('JWT_AUTH_SECRET_KEY', AUTH_KEY);` — AUTH_KEY can contain characters that break JWT signing/verification.
- Do **not** redefine `AUTH_KEY`, `SECURE_AUTH_KEY`, or other WordPress salts a second time in `wp-config.php`. Keep only the first block of auth keys/salts from the WordPress installer.

---

## 2. Pass the Authorization header (Apache / Cloudways) — fixes refresh = logout

If your server strips the `Authorization` header, WordPress never sees the JWT. Then **token validate** and **users/me** return 401, so the app clears the session and you get **auto logout on refresh**. This is the #1 cause when moving to a new WordPress URL or host.

**On Apache** (e.g. Cloudways), add this to the **.htaccess** in your WordPress root (same folder as `wp-config.php`), **inside** the `<IfModule mod_rewrite.c>` block, near the top after `RewriteEngine On`:

```apache
# Pass Authorization header to PHP for JWT
RewriteCond %{HTTP:Authorization} .
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```

If you don’t have `mod_rewrite`, ask your host how to pass `Authorization` through to PHP (e.g. Nginx: `proxy_set_header Authorization $http_authorization;`).

---

## 3. Plugin and REST API

- Install and **activate** **JWT Authentication for WP REST API** on the WordPress site that your Next.js app uses (`WC_API_URL` / `NEXT_PUBLIC_WP_URL`).
- Ensure the REST API is reachable:  
  `https://your-wp-site.com/wp-json/`  
  should return JSON, not an HTML error page.

---

## 4. Optional: Allow unauthenticated access to the token endpoint

If the JWT **token** endpoint (`/wp-json/jwt-auth/v1/token`) returns 403 before checking username/password, add this to your theme’s `functions.php` or a small custom plugin:

```php
add_filter('rest_authentication_errors', function ($result) {
    if (!empty($result)) {
        return $result;
    }
    // Allow unauthenticated access so login can run
    return true;
});
```

Some setups need this; others work with only the secret and the Authorization header.

---

## Checklist

| Step | Action |
|------|--------|
| 1 | In `wp-config.php`: set `JWT_AUTH_SECRET_KEY` to a **dedicated** long random string (not `AUTH_KEY`). |
| 2 | Remove any **duplicate** block that redefines `AUTH_KEY` / salts. |
| 3 | In WordPress root `.htaccess`: add the two lines to pass `Authorization` to PHP. |
| 4 | Activate **JWT Authentication for WP REST API** on the correct WordPress site. |
| 5 | (Optional) Add the `rest_authentication_errors` filter if login still returns 403. |

After this, the Next.js app should be able to log in and keep the session (no immediate logout). No changes are required in `.env` for this; the app already uses `WC_API_URL` / `NEXT_PUBLIC_WP_URL` for the JWT endpoints.

**Addresses page → WooCommerce:** The same JWT setup (secret + Authorization header) is used when the app saves the 2nd address to WordPress. If this is configured, addresses added on the dashboard Addresses page are stored in **Edit User → Customer Billing/Shipping Address (Secondary)**. See [wordpress-secondary-addresses-README.md](./wordpress-secondary-addresses-README.md).

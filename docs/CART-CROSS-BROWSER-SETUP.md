# Cross-browser cart for logged-in users

When a user is logged in, their cart is stored in WordPress so they see the same cart on every browser/device. Guest carts stay in the browser only.

## WordPress setup (required for cross-browser cart)

**Important:** You need **two separate files** with **different content**:
- **`wordpress-headless-cart-rest-api.php`** must contain the **cart** routes only (`customers/v1/headless-cart`). Copy from `docs/wordpress-headless-cart-rest-api.php` in this repo.
- **`wordpress-wishlist-rest-api.php`** must contain the **wishlist** routes only (`custom/v1/wishlist`, etc.). Copy from `docs/wordpress-wishlist-rest-api.php` in this repo.  
Do **not** put wishlist code inside the cart file, or cart code inside the wishlist file.

1. Copy **`docs/wordpress-headless-cart-rest-api.php`** (from this Next.js project) into your theme as **`wordpress-headless-cart-rest-api.php`**.  
   Example server path: `wp-content/themes/martfury-child/wordpress-headless-cart-rest-api.php`  
   That file must register the route **`/wp-json/customers/v1/headless-cart`** (GET and POST with `items`).

2. In your theme **`functions.php`**, add (do **not** put these lines inside the wishlist or cart PHP files):

```php
require_once get_stylesheet_directory() . '/wordpress-headless-cart-rest-api.php';
require_once get_stylesheet_directory() . '/wordpress-wishlist-rest-api.php';
```

Each PHP file should contain only its own route code. Both `require_once` lines belong in `functions.php` only.

3. **JWT + Authorization header (required for cart to sync)**

   The app calls WordPress with `Authorization: Bearer <JWT>`. If the server strips this header (common on **Apache / Cloudways**), WordPress never sees the user and returns 401 or empty cart.

   **In your WordPress root** (same folder as `wp-config.php`), edit **`.htaccess`**. Inside the `<IfModule mod_rewrite.c>` block, add these two lines **right after** `RewriteEngine On`:

   ```apache
   # Pass Authorization header to PHP for JWT (cart, wishlist, addresses)
   RewriteCond %{HTTP:Authorization} .
   RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
   ```

   Also ensure:
   - **JWT Authentication for WP REST API** is installed and active.
   - In `wp-config.php`: `define('JWT_AUTH_SECRET_KEY', 'your-long-secret');` (see [JWT_WORDPRESS_SETUP.md](./JWT_WORDPRESS_SETUP.md)).

4. After deploying the PHP file, **re-upload** `wordpress-headless-cart-rest-api.php` if you had an older version (GET now returns 200 with empty items when not logged in, so you no longer see "rest_forbidden" when opening the URL in a browser).

After this, the app will:

- **Save** the cart to WordPress when the user changes the cart or leaves the page.
- **Load** the cart from WordPress when the user opens the site in another browser.

If you still see an empty cart on a second browser, check that the `.htaccess` rule is in place and the JWT plugin is active; otherwise WordPress does not see the Bearer token and cannot associate the cart with the user.

---

## Wishlist (same setup for cross-browser)

For the wishlist to show on any browser/device when the user is logged in:

1. Copy **`docs/wordpress-wishlist-rest-api.php`** into your theme folder (same as cart).
2. In **`functions.php`**, add:
   ```php
   require_once get_stylesheet_directory() . '/wordpress-wishlist-rest-api.php';
   ```
3. The same `.htaccess` rule and JWT plugin (step 3 above) apply: the app sends `Authorization: Bearer <JWT>` to WordPress for wishlist GET/add/remove.

---

## Common mistake: cart file contains wishlist code

If **`wordpress-headless-cart-rest-api.php`** on the server contains the **wishlist** code (routes like `custom/v1/wishlist`, `wishlist/add`, `wishlist/remove`), then the **cart** route `customers/v1/headless-cart` is never registered. Result: wishlist works, cart stays empty on the other browser.

**Fix:** Replace the contents of `wordpress-headless-cart-rest-api.php` on the server with the **cart** code from this repo’s `docs/wordpress-headless-cart-rest-api.php` (the file that registers `customers/v1/headless-cart` with GET returning `{ items: [...] }` and POST accepting `{ items: [...] }`). Keep the wishlist code in a **separate** file `wordpress-wishlist-rest-api.php`, and in `functions.php` have both:

```php
require_once get_stylesheet_directory() . '/wordpress-headless-cart-rest-api.php';
require_once get_stylesheet_directory() . '/wordpress-wishlist-rest-api.php';
```

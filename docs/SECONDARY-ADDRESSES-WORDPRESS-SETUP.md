# Fix: Addresses Not Showing in WordPress Backend

When you add an address on the **Addresses** page in the app, it should appear in WordPress. The REST API saves to:

- **Secondary** meta (`billing2_*` / `shipping2_*`) for the Addresses dashboard.
- **Primary** WooCommerce meta (`billing_*` / `shipping_*`) **only when requested** (e.g. checkout save), so **Edit User → Customer billing address** / **Customer shipping address** and your DB report (e.g. `billing_first_name`, `billing_last_name`) show the checkout address.

If those backend fields stay empty, follow this setup.

---

## Step 1: Add the REST API file in WordPress

1. Copy this file from your Next.js project into your **WordPress theme** folder:
   - **From:** `docs/wordpress-secondary-addresses-rest-api.php`
   - **To:** Your theme folder, e.g.  
     `wp-content/themes/bootscore-child/wordpress-secondary-addresses-rest-api.php`

2. In your theme’s **functions.php** (e.g. `bootscore-child/functions.php`), add at the end:

```php
require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';
```

3. Save and reload. The route `GET/POST /wp-json/customers/v1/addresses-secondary` will be registered (no 404).

---

## Step 2: Authenticate REST API requests (JWT)

The Next.js app sends **Authorization: Bearer &lt;JWT&gt;** to WordPress. WordPress must accept that token and set the logged-in user for REST requests; otherwise the secondary endpoint returns **401** and addresses are not saved.

**Option A – You already use a JWT plugin for login**

- Use the same JWT plugin that issues the token (e.g. **JWT Authentication for WP REST API**, **Simple JWT Login**).
- Ensure it runs for **all** REST requests (not only `/jwt-auth/` or login). It should hook into `determine_current_user` or `rest_authentication_errors` and set the user when it sees a valid Bearer token.
- Test: open a REST URL that requires login with your JWT in the header; you should get 200, not 401.

**Option B – No JWT plugin yet**

1. Install a JWT plugin, e.g. **“JWT Authentication for WP REST API”** or **“Simple JWT Login”**.
2. Configure it (secret key, endpoints) as per the plugin docs.
3. Ensure your Next.js app uses the same JWT for login and for API calls (it already sends `Authorization: Bearer &lt;token&gt;`).
4. The plugin must set the current user when **any** REST request includes a valid Bearer token so that `is_user_logged_in()` is true for the secondary addresses route.

---

## Step 3: Verify

1. In the app, go to **Addresses** and **Add Billing Address** (or Shipping). Fill and save.
2. In WordPress admin, go to **Users → Edit** that user.
3. Scroll to **Customer Billing Address (Secondary)** (or Shipping). The fields should now be filled.

If it still fails:

- Check **Next.js server logs** when you add an address. You should see:
  - `[Addresses] Secondary endpoint returned 404` → Step 1 not done or file not loaded.
  - `[Addresses] Secondary endpoint returned 401` → Step 2: JWT not applied to REST.
- Confirm the theme file is loaded: temporarily add `error_log('Secondary addresses REST loaded');` at the top of `wordpress-secondary-addresses-rest-api.php` and check your PHP error log after loading any front-end page.

---

## Summary

| Problem | What to do |
|--------|------------|
| Secondary fields in WP stay empty | 1) Add REST file to theme and `require` in `functions.php`. 2) Use a JWT plugin so REST requests with Bearer token are logged in. |
| 404 in Next.js logs | REST file missing or wrong path in `require_once`. |
| 401 in Next.js logs | WordPress not authenticating Bearer token for REST; fix JWT plugin / hooks. |

After both steps are done, addresses added on the Addresses page are stored in:

- **Customer Billing/Shipping Address (Secondary)** (billing2_* / shipping2_*)

Primary billing/shipping (`billing_*` / `shipping_*`) is updated only when the client sends `sync_primary: true` (the checkout flow does this).

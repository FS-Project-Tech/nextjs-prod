# WordPress: Secondary Billing & Shipping Addresses

So the **2nd address** (from the dashboard Addresses page) is stored in the WooCommerce/WordPress backend (user meta) and appears under **Edit User → Customer Billing/Shipping Address (Secondary)**.

- **Checkout page address** → stored in **Customer billing address** / **Customer Shipping address** (primary).
- **Address page (2nd address)** → stored in **Customer Billing Address (Secondary)** / **Customer Shipping Address (Secondary)** (same Edit User screen).

## 1. Theme files

- **`wordpress-functions-secondary-addresses.php`** – Code to paste into your theme’s **functions.php** (at the end).
- **`wordpress-secondary-addresses-rest-api.php`** – Standalone file; put it in the **same theme folder** as `functions.php` (e.g. `wp-content/themes/bootscore-child/`).

The functions snippet ends with:

```php
require_once get_stylesheet_directory() . '/wordpress-secondary-addresses-rest-api.php';
```

So WordPress loads the REST API from that file.

## 2. What goes in functions.php

Paste the **entire contents** of `wordpress-functions-secondary-addresses.php` at the end of your theme’s `functions.php`. It:

- Adds **Customer Billing Address (Secondary)** and **Customer Shipping Address (Secondary)** to the user edit screen (including NDIS/HCP fields for billing).
- Saves all those fields when an admin clicks **Update User** (`save_secondary_addresses`).

## 3. REST API (for the Next.js app)

The REST file registers:

| Method | Route | Purpose |
|--------|--------|--------|
| GET | `/wp-json/customers/v1/addresses-secondary` | List billing2 + shipping2 (same user meta as the admin form). |
| POST | `/wp-json/customers/v1/addresses-secondary` | Save an address (body: `type`: `billing` or `shipping` + address fields). |
| PUT | `/wp-json/customers/v1/addresses-secondary/billing2` or `.../shipping2` | Update that address. |
| DELETE | Same as PUT | Clear that address. |

The Next.js dashboard **Addresses** page and checkout can call these so addresses are stored in WordPress (user meta `billing2_*` / `shipping2_*`) and stay after refresh.

## 4. Auth – store address page data in WooCommerce

For the **Address page** to save into WordPress (so you see it under Edit User → Customer Billing/Shipping Address Secondary), REST requests must be authenticated:

1. **JWT plugin** – Install and activate **JWT Authentication for WP REST API** on the WordPress site.
2. **Secret** – In `wp-config.php` define `JWT_AUTH_SECRET_KEY` (long random string). See [JWT_WORDPRESS_SETUP.md](./JWT_WORDPRESS_SETUP.md).
3. **Authorization header** – Add the `.htaccess` rule so `Authorization: Bearer <JWT>` reaches PHP (otherwise WordPress returns 401 and the app cannot save to backend). Same as in [JWT_WORDPRESS_SETUP.md](./JWT_WORDPRESS_SETUP.md#2-pass-the-authorization-header-apache--cloudways--fixes-refresh--logout).

After this, when a user adds an address on the dashboard Addresses page, the app sends it to `POST /wp-json/customers/v1/addresses-secondary`; WordPress validates the JWT, sets the user, and saves to `billing2_*` / `shipping2_*` user meta. You’ll see it in **Edit User** and it will persist after refresh.

**If you don’t have JWT auth set up yet:** the Next.js app still saves addresses in its local file store when WordPress returns 401/404, so addresses **persist after refresh** in the app. They just won’t appear in WordPress Edit User until REST auth is configured.

### Troubleshooting: “I don’t see secondary address in DB or in WooCommerce”

The address is only written to the DB (and Edit User) when WordPress accepts the app’s REST request. Use this check:

1. **Call the debug endpoint** (with the same JWT your app uses; e.g. from browser console while logged in: get the token from your app’s session, or use Postman):
   - **URL:** `GET https://YOUR-WP-SITE.com/wp-json/customers/v1/addresses-secondary-debug`
   - **Header:** `Authorization: Bearer YOUR_JWT_TOKEN`

2. **Check the JSON response:**
   - **`auth_header_present: false`** → The `Authorization` header is not reaching PHP. Add the `.htaccess` rule from [JWT_WORDPRESS_SETUP.md](./JWT_WORDPRESS_SETUP.md#2-pass-the-authorization-header-apache--cloudways--fixes-refresh--logout) in your WordPress root.
   - **`auth_header_present: true` but `user_id: 0`** → Header is there but the user is not set. Ensure **JWT Authentication for WP REST API** is active and **`JWT_AUTH_SECRET_KEY`** is set in `wp-config.php` (same secret used when the token was issued). Restart PHP if you changed `wp-config.php`.
   - **`user_id: 123`** (non-zero) → Auth works. Adding an address from the app should save to `wp_usermeta` (keys `billing2_*` / `shipping2_*`) and show under **Users → Edit User → Customer Billing/Shipping Address (Secondary)**. If it still doesn’t, confirm the REST file is loaded (theme’s `functions.php` has `require_once ... wordpress-secondary-addresses-rest-api.php`).

3. **Confirm the REST file is in the theme:** The file `wordpress-secondary-addresses-rest-api.php` must be in the **active theme** folder (e.g. `wp-content/themes/martfury-child/`). If you use a child theme, put it there and require it from the child theme’s `functions.php`.

## 5. Field list (same in admin form and REST)

- **Billing (Secondary):** first_name, last_name, company, address_1, address_2, city, state, postcode, country, phone, email, NDIS fields, HCP fields (including approval checkboxes).
- **Shipping (Secondary):** first_name, last_name, company, address_1, address_2, city, state, postcode, country, phone, email.

These match the keys in both the profile form and the REST API so data stays in sync.

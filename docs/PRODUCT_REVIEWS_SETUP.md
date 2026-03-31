# Product Reviews – Custom Endpoint Setup

When your WooCommerce REST API does **not** expose the product reviews route (you get "No route was found matching the URL and request method"), the Next.js app uses a **custom WordPress REST endpoint** to create reviews. **Only logged-in users** can add reviews; guests see "Please log in to add a review" with a login link.

## What was done in Next.js

- **Login required:** Only authenticated users can submit a review. The product page shows "Please log in to add a review" and a **Log in** button when the user is not logged in. The API returns 401 if a review is submitted without auth.
- **Create review:** The app tries WooCommerce `POST /wp-json/wc/v3/products/{id}/reviews` first. If WordPress returns `rest_no_route`, it then calls the custom endpoint `POST /wp-json/custom/v1/products/{id}/reviews`. Logged-in user’s name and email are sent as reviewer.
- **Fetch reviews:** The app tries WooCommerce GET product reviews first. If that fails or returns no reviews, it calls `GET /wp-json/custom/v1/products/{id}/reviews` so reviews created via the custom endpoint are shown.
- **WordPress PHP:** You must add the custom code on WordPress. The PHP file registers both **GET** (list reviews) and **POST** (create review) on `/custom/v1/products/{id}/reviews` and updates the product's average rating and review count when a review is created.

---

## Next process: Add code to WordPress `functions.php`

Follow these steps so the "No route was found" error is fixed and reviews work.

### Step 1: Copy the PHP code

1. In this repo, open **`docs/wordpress-product-reviews-endpoint.php`**.
2. Select **all** the code (from `<?php` at the top to the very last `}`).
3. Copy it (Ctrl+C / Cmd+C). Use plain text; avoid pasting from Word or rich text (can cause critical errors).

### Step 2: Paste into WordPress

1. Log in to your **WordPress admin** (e.g. `https://wordpress-1513595-6089575.cloudwaysapps.com/wp-admin`).
2. Go to **Appearance → Theme File Editor** (or use FTP/cPanel to edit the active theme’s `functions.php`).
3. Open **Theme Functions** (`functions.php`).
4. Scroll to the **very end** of the file (before `?>` if that tag exists).
5. Paste the copied code. Do **not** remove existing code; only add the new block at the end.
6. Click **Update File**. If you see a **critical error**, go to **If you get a critical error** below.

### Step 3: Verify the code is loading (important)

1. In the browser, open this URL (replace with your real WordPress URL):  
   **`https://YOUR-WORDPRESS-URL.com/wp-json/custom/v1/reviews-check`**  
   Example: `https://wordpress-1513595-6089575.cloudwaysapps.com/wp-json/custom/v1/reviews-check`
2. You should see: **`{"ok":true,"message":"Product reviews endpoint is active"}`**
3. If you get **404** or "No route was found", the PHP code is **not** running. Go to **If you still see "No route was found"** below.

### Step 4: Confirm the POST route exists

1. Open: `https://YOUR-WORDPRESS-URL.com/wp-json/custom/v1`
2. In the JSON, find a route containing **`products`** and **`reviews`** with method **POST** (e.g. `/custom/v1/products/(?P<id>\d+)/reviews`).

### Step 5: Test from the app

1. **Log in** to your Next.js site.
2. Open a **product page** and scroll to **Reviews**.
3. You should see the **Add a review** form (rating stars, review text, Submit).
4. Submit a review. You should get a success message and no "No route was found" error.

---

## If you still see "No route was found" after adding the code

1. **Test route first**  
   Open: `https://YOUR-SITE.com/wp-json/custom/v1/reviews-check`  
   - If you see `{"ok":true,...}` → the code is loading; the problem may be caching or the POST URL.  
   - If you get **404** → the code is **not** running. Continue below.

2. **Use the active theme**  
   Go to **Appearance → Themes**. The theme marked "Active" is the one in use. Edit **that** theme’s `functions.php`. If you use a **child theme**, add the code to the **child** theme’s `functions.php`, not the parent.

3. **Check for PHP errors**  
   In `wp-config.php` add (or set to true):  
   `define('WP_DEBUG', true);` and `define('WP_DEBUG_LOG', true);`  
   Load any page, then check `wp-content/debug.log`. Fix any errors related to `functions.php` or `custom_v1_create_product_review`.

4. **Copy the full file**  
   Make sure you copied the **entire** contents of `wordpress-product-reviews-endpoint.php`, from the first `<?php` to the very last `}`. No missing lines.

5. **Clear cache**  
   Clear WordPress cache (plugin or host, e.g. Cloudways), then open `/wp-json/custom/v1/reviews-check` again.

6. **No Theme File Editor?**  
   Some hosts disable it. Use FTP, cPanel File Manager, or a plugin to edit the active theme’s `functions.php` and paste the same code at the end.

---

## If you get a critical error when adding the code

1. **Restore your site**  
   Remove the block you just pasted from `functions.php` (delete from the line that starts with `add_action('rest_api_init'` down to the last `}` of the review code). Save. Your site should work again.

2. **Use the updated PHP file**  
   The file `wordpress-product-reviews-endpoint.php` was updated to avoid critical errors: it uses named functions only (no anonymous functions) and unique names (`custom_v1_...`). Copy the **entire** file again and paste it at the end of `functions.php`. Save and test.

3. **Copy as plain text**  
   Do not paste from Word, Google Docs, or email. Open the `.php` file in Notepad, VS Code, or Cursor, select all, copy, then paste into WordPress. This avoids smart quotes or invisible characters that can cause PHP fatal errors.

4. **Check for duplicate code**  
   If you added the review code more than once, remove all copies and add it only once.

5. **See the real error**  
   In `wp-config.php` (via FTP or File Manager) add before "That's all, stop editing!":  
   `define('WP_DEBUG', true);`  
   `define('WP_DEBUG_LOG', true);`  
   `define('WP_DEBUG_DISPLAY', false);`  
   Save, then trigger the error again. Open `wp-content/debug.log` and read the last lines to see the exact PHP error (e.g. "Cannot redeclare function" or "syntax error").

---

## Optional: merge with existing custom routes

If you already use **`docs/wordpress-endpoints.php`** (e.g. for register, forgot-password), you can add the product review route inside the same `add_action('rest_api_init', ...)` in that file. Copy only the `register_rest_route` calls and the `custom_v1_create_product_review` function (and its helper) from `wordpress-product-reviews-endpoint.php` into `wordpress-endpoints.php`.

# Address Book for WooCommerce – Headless integration

This guide explains how to use **Address Book for WooCommerce** (and your existing **Address Management API** / **Customer Addresses API** plugins) with the Next.js headless app and the dashboard address design.

---

## 1. Activate the plugin in WordPress

1. In **WordPress admin** go to **Plugins**.
2. Find **Address Book for WooCommerce** (CrossPeak).
3. Click **Activate**.

This plugin lets customers store multiple shipping (and often billing) addresses. Your **Address Management API** and **Customer Addresses API** plugins provide the REST API that the headless app uses.

---

## 2. REST API the headless app uses

The Next.js app talks to WordPress at:

| Action   | WordPress REST route                          |
|----------|------------------------------------------------|
| List     | `GET  /wp-json/customers/v1/addresses`        |
| Add      | `POST /wp-json/customers/v1/addresses`        |
| Update   | `PUT  /wp-json/customers/v1/addresses/{id}`   |
| Delete   | `DELETE /wp-json/customers/v1/addresses/{id}` |

These routes are usually provided by your **Address Management API** or **Customer Addresses API** plugin. After you activate **Address Book for WooCommerce**, the same API may start reading/writing the data that plugin stores (if they integrate), or the API may be independent—either way the headless app keeps using the same URLs.

---

## 3. Ensure the API is available and auth works

1. **WordPress URL**  
   In your Next.js env (e.g. `.env.local`) you should have the WordPress site URL, e.g.  
   `NEXT_PUBLIC_WP_URL` or whatever your app uses for `getWpBaseUrl()`.

2. **Auth**  
   The app sends the logged-in user’s **Bearer token** in the `Authorization` header to WordPress. Ensure:
   - Users log in via your headless auth (e.g. JWT or cookie that maps to a WordPress user).
   - The same token is accepted by WordPress for `/wp-json/customers/v1/addresses` (and `/wp/v2/users/me` for user id).

3. **Check the route**  
   In the browser (or Postman) while logged in to WordPress (or using a token), open:
   - `https://your-wp-site.com/wp-json/customers/v1/addresses`  
   If you get JSON (e.g. `{ "addresses": [] }`) or a list of addresses, the API is working.

---

## 4. How the headless app behaves

- **Dashboard → Addresses** in the Next.js app uses the **same design and flow** you have now:
  - Add billing / Add shipping
  - List of saved addresses with Edit / Delete
  - Form fields: type, label, first name, last name, company, address 1 & 2, city, state, postcode, country, email, phone

- **Flow:**
  1. User opens **Dashboard → Addresses**.
  2. Next.js calls **your API**: `GET /api/dashboard/addresses`.
  3. Your API calls WordPress: `GET {WP_URL}/wp-json/customers/v1/addresses` with the user’s token.
  4. If WordPress returns **200** with `{ addresses: [...] }`, the app shows that list (and merges with in-memory fallback if you use it).
  5. **Add**: form submit → `POST /api/dashboard/addresses` → your API → `POST .../customers/v1/addresses` on WordPress.
  6. **Edit**: form submit → `PUT /api/dashboard/addresses/{id}` → your API → `PUT .../customers/v1/addresses/{id}`.
  7. **Delete**: → `DELETE /api/dashboard/addresses/{id}` → your API → `DELETE .../customers/v1/addresses/{id}`.

So: **no change is required in the headless “design” or UI**; you keep the same dashboard and form. You only need WordPress and the plugins to expose the routes above and accept the payloads.

---

## 5. Payload shape (so WordPress can accept it)

The app sends (and expects back) address objects in this shape:

- `type`: `"billing"` | `"shipping"`
- `label`: optional string
- `first_name`, `last_name`, `company`, `address_1`, `address_2`, `city`, `state`, `postcode`, `country`, `email`, `phone`

If your **Address Management API** or **Customer Addresses API** plugin expects different names (e.g. `address_1` vs `address1`), you have two options:

- **Option A:** Change the Next.js API route (e.g. in `app/api/dashboard/addresses/route.ts` and `[id]/route.ts`) to map our field names to the plugin’s names before calling WordPress.
- **Option B:** Change the plugin so it accepts and returns the same field names (if you control the plugin).

---

## 6. If WordPress returns 404 (no endpoint yet)

Your app already has a **fallback**:

- If `GET/POST/PUT/DELETE` to `.../customers/v1/addresses` returns **404** (or **501** for POST), the Next.js API uses an **in-memory store** so add/edit/delete still work. Data is per user but **lost on server restart**.

After **Address Book for WooCommerce** is activated and your API plugin is active and registered, the WordPress routes should respond with **200** and addresses will **persist in WordPress**.

---

## 7. Quick checklist

- [ ] Activate **Address Book for WooCommerce** in WordPress.
- [ ] Keep **Address Management API** and/or **Customer Addresses API** active (they provide the REST endpoints).
- [ ] Confirm WordPress URL and auth token are correct in the headless app.
- [ ] Open `https://your-wp-site.com/wp-json/customers/v1/addresses` (with auth); you should get JSON, not 404.
- [ ] In the headless app: **Dashboard → Addresses** → Add address → Edit → Delete; confirm they persist after refresh and that company and other fields are correct.

---

## 8. Summary

- **Activate** Address Book for WooCommerce in WordPress.
- **Keep** your current headless design and dashboard addresses UI; no UI change is required.
- The app already uses **`/wp-json/customers/v1/addresses`** for list/add/update/delete; ensure your WordPress API plugins register these routes and that auth works.
- If the plugin uses different field names, add a small mapping in the Next.js API routes so the headless app and WordPress stay in sync.

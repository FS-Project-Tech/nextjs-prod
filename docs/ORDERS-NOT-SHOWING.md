# Backend shows orders but website shows "No orders yet"

If you see orders in **WordPress Admin → WooCommerce → Orders** (e.g. for "Sarah Johnson") but the **website dashboard** shows "Total Orders: 0" or "No orders yet", check the following.

**Note:** The customer stats API (`/api/dashboard/customer`) and orders API (`/api/dashboard/orders`) both use the WooCommerce REST API with **Consumer Key/Secret** (not JWT). They fetch orders filtered by `customer=<user_id>`.

## 1. Same WordPress URL in .env

The Next.js app must talk to the **same** WordPress where you see the orders.

- In the browser, your backend URL is something like:  
  `wordpress-1513595-6089575.cloudwaysapps.com/wp-admin/...`
- In your project **`.env.local`** you must have:

```env
NEXT_PUBLIC_WP_URL=https://wordpress-1513595-6089575.cloudwaysapps.com
WC_API_URL=https://wordpress-1513595-6089575.cloudwaysapps.com/wp-json/wc/v3
```

Use the **exact same host** as in the backend (no mix of old/new URLs). If `WC_API_URL` or `NEXT_PUBLIC_WP_URL` point to a different site, the app will fetch orders from that other site and may return none.

## 2. WooCommerce REST API credentials

- `WC_CONSUMER_KEY` and `WC_CONSUMER_SECRET` in `.env.local` must be the **WooCommerce REST API keys** for that same WordPress site (WooCommerce → Settings → Advanced → REST API).
- The API user must be allowed to **read** orders.

## 3. Same user on the website

- Log in on the website with the **same** account as in the backend (e.g. sarah.johnson@teststore.com).
- Orders are filtered by **customer ID** (WordPress user ID). If you log in with a different user on the site, you will not see another user’s orders.

## 4. Orders linked to the customer

- In WooCommerce, each order has a **Customer**. That customer must be the same WordPress user you’re logged in as on the site.
- If orders were created as **guest** or linked to a different customer, they won’t show for the logged-in user.

## 5. Check the terminal (development)

When you open the dashboard with the app running (`npm run dev`), watch the **terminal** where the server is running. You should see logs like:

- `[dashboard/customer] Fetching orders for customerId: 123 WC_API_URL: set` – confirms which user ID is used and that `WC_API_URL` is set.
- `[dashboard/customer] WooCommerce orders: { returned: 5, 'x-wp-total': 5 }` – confirms the WooCommerce API returned orders.
- If you see `[dashboard/customer] Error fetching orders:` with a **status: 401** or **403**, the REST API keys are wrong or don’t have permission. If **status: 404**, the URL may be wrong. If **status: 0** or a network error, the WordPress URL may be unreachable from the app.

After fixing the URL and credentials, restart the Next.js dev server (`npm run dev`) and open the dashboard again.

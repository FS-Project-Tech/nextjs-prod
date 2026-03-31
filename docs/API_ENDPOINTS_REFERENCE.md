# API Endpoints Reference

## Authentication Endpoints

### POST /api/auth/login
Login user and create session.

**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": { ... },
  "customer": { ... },
  "csrfToken": "...",
  "redirectTo": "/my-account"
}
```

### POST /api/auth/register
Register new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### POST /api/auth/logout
Logout user and clear session.

### GET /api/auth/me
Get current authenticated user.

### GET /api/auth/validate
Validate current session.

---

## WooCommerce Session Endpoints

### GET /api/wc/session
Get current WooCommerce session information.

**Response:**
```json
{
  "session_id": "...",
  "has_session": true,
  "customer_id": 123
}
```

### POST /api/wc/session
Create or refresh WooCommerce session.

**Request:**
```json
{
  "customer_id": 123
}
```

---

## Cart Endpoints

### POST /api/cart/sync
Sync cart with WooCommerce and get validated prices.

**Request:**
```json
{
  "items": [
    {
      "id": "123",
      "productId": 123,
      "variationId": 456,
      "qty": 2,
      "price": "99.99"
    }
  ],
  "couponCode": "SAVE10"
}
```

**Response:**
```json
{
  "success": true,
  "cart": {
    "items": [...],
    "subtotal": "199.98",
    "total": "219.98",
    "tax_total": "20.00"
  }
}
```

### POST /api/cart/validate
Validate cart items (stock, availability).

### POST /api/cart/prices
Update cart item prices from WooCommerce.

### GET /api/wc/cart
Get cart from WooCommerce Store API (if available).

### POST /api/wc/cart
Add item to cart via Store API (if available).

---

## Checkout Endpoints

### POST /api/checkout
Process checkout and create order.

**Request:**
```json
{
  "billing": { ... },
  "shipping": { ... },
  "line_items": [...],
  "payment_method": "bacs",
  "shipping_lines": [...],
  "coupon_code": "SAVE10"
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": 12345,
    "order_key": "...",
    "status": "processing"
  }
}
```

### GET /api/wc/checkout
Get checkout data (shipping methods, payment methods).

---

## Notes

- All endpoints require `Content-Type: application/json` header
- Authentication endpoints return CSRF tokens for subsequent requests
- Cart endpoints use WooCommerce session for persistence
- Checkout endpoint includes idempotency to prevent duplicate orders
- All endpoints include CORS headers for cross-origin requests
- Security headers are applied to all responses


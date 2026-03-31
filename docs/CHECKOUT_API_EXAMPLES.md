# Checkout API Examples

Complete examples for WooCommerce Orders API integration.

---

## API Endpoint

**POST** `/api/checkout`

---

## Request Payload Examples

### Example 1: Standard Order with Online Payment

```json
{
  "billing": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "+61 400 123 456",
    "address_1": "123 Main Street",
    "address_2": "Unit 5",
    "city": "Sydney",
    "state": "NSW",
    "postcode": "2000",
    "country": "AU"
  },
  "shipping": {
    "first_name": "John",
    "last_name": "Doe",
    "address_1": "123 Main Street",
    "address_2": "Unit 5",
    "city": "Sydney",
    "state": "NSW",
    "postcode": "2000",
    "country": "AU"
  },
  "payment_method": "paypal",
  "payment_processed": true,
  "line_items": [
    {
      "product_id": 123,
      "variation_id": 456,
      "quantity": 2,
      "name": "Product Name",
      "price": "29.99",
      "sku": "PROD-123",
      "slug": "product-name"
    }
  ],
  "shipping_lines": [
    {
      "method_id": "flat_rate",
      "total": "10.00"
    }
  ],
  "coupon_code": "SAVE10",
  "csrf_token": "abc123...",
  "ndis_number": "NDIS123456",
  "hcp_number": "HCP789012",
  "delivery_authority": "with_signature",
  "delivery_instructions": "Leave at front door",
  "subscribe_newsletter": true,
  "total": 75.98
}
```

### Example 2: Order with Offline Payment (COD)

```json
{
  "billing": {
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane.smith@example.com",
    "phone": "+61 400 789 012",
    "address_1": "456 Oak Avenue",
    "city": "Melbourne",
    "state": "VIC",
    "postcode": "3000",
    "country": "AU"
  },
  "shipping": {
    "first_name": "Jane",
    "last_name": "Smith",
    "address_1": "456 Oak Avenue",
    "city": "Melbourne",
    "state": "VIC",
    "postcode": "3000",
    "country": "AU"
  },
  "payment_method": "cod",
  "payment_processed": false,
  "line_items": [
    {
      "product_id": 789,
      "quantity": 1,
      "name": "Another Product",
      "price": "49.99",
      "sku": "PROD-789",
      "slug": "another-product"
    }
  ],
  "shipping_lines": [
    {
      "method_id": "flat_rate",
      "total": "15.00"
    }
  ],
  "csrf_token": "xyz789...",
  "delivery_authority": "without_signature",
  "subscribe_newsletter": false,
  "total": 64.99
}
```

### Example 3: Order with Bank Transfer

```json
{
  "billing": {
    "first_name": "Bob",
    "last_name": "Johnson",
    "email": "bob.johnson@example.com",
    "phone": "+61 400 345 678",
    "address_1": "789 Pine Road",
    "city": "Brisbane",
    "state": "QLD",
    "postcode": "4000",
    "country": "AU"
  },
  "shipping": {
    "first_name": "Bob",
    "last_name": "Johnson",
    "address_1": "789 Pine Road",
    "city": "Brisbane",
    "state": "QLD",
    "postcode": "4000",
    "country": "AU"
  },
  "payment_method": "bacs",
  "payment_processed": false,
  "line_items": [
    {
      "product_id": 321,
      "quantity": 3,
      "name": "Bulk Product",
      "price": "19.99",
      "sku": "PROD-321",
      "slug": "bulk-product"
    }
  ],
  "shipping_lines": [
    {
      "method_id": "free_shipping",
      "total": "0.00"
    }
  ],
  "csrf_token": "def456...",
  "hcp_number": "HCP345678",
  "delivery_authority": "with_signature",
  "delivery_instructions": "Please call before delivery",
  "subscribe_newsletter": true,
  "total": 65.97
}
```

---

## Response Examples

### Success Response

```json
{
  "success": true,
  "order": {
    "id": 12345,
    "order_key": "wc_order_abc123def456",
    "status": "processing",
    "total": "75.98",
    "payment_method": "paypal",
    "payment_method_title": "PayPal",
    "billing": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phone": "+61 400 123 456",
      "address_1": "123 Main Street",
      "city": "Sydney",
      "state": "NSW",
      "postcode": "2000",
      "country": "AU"
    },
    "shipping": {
      "first_name": "John",
      "last_name": "Doe",
      "address_1": "123 Main Street",
      "city": "Sydney",
      "state": "NSW",
      "postcode": "2000",
      "country": "AU"
    },
    "line_items": [
      {
        "id": 1,
        "name": "Product Name",
        "quantity": 2,
        "price": "29.99",
        "sku": "PROD-123"
      }
    ]
  },
  "idempotency_key": "base64encodedkey",
  "redirect_url": "/checkout/order-review?orderId=12345"
}
```

### Error Response

```json
{
  "error": "Billing information is required",
  "details": {}
}
```

---

## WooCommerce Order Creation Payload

The API transforms the request into WooCommerce format:

```json
{
  "payment_method": "paypal",
  "payment_method_title": "PayPal",
  "set_paid": true,
  "status": "processing",
  "customer_ip_address": "192.168.1.1",
  "billing": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "+61 400 123 456",
    "address_1": "123 Main Street",
    "address_2": "Unit 5",
    "city": "Sydney",
    "state": "NSW",
    "postcode": "2000",
    "country": "AU"
  },
  "shipping": {
    "first_name": "John",
    "last_name": "Doe",
    "address_1": "123 Main Street",
    "address_2": "Unit 5",
    "city": "Sydney",
    "state": "NSW",
    "postcode": "2000",
    "country": "AU"
  },
  "line_items": [
    {
      "product_id": 123,
      "variation_id": 456,
      "quantity": 2
    }
  ],
  "shipping_lines": [
    {
      "method_id": "flat_rate",
      "total": "10.00"
    }
  ],
  "coupon_lines": [
    {
      "code": "SAVE10"
    }
  ],
  "meta_data": [
    {
      "key": "NDIS Number",
      "value": "NDIS123456"
    },
    {
      "key": "HCP Number",
      "value": "HCP789012"
    },
    {
      "key": "Delivery Authority",
      "value": "With Signature"
    },
    {
      "key": "Delivery Instructions",
      "value": "Leave at front door"
    },
    {
      "key": "Newsletter Subscription",
      "value": "Yes"
    },
    {
      "key": "_idempotency_key",
      "value": "base64encodedkey"
    }
  ]
}
```

---

## Update Order Payload

To update an existing order (via WooCommerce API directly):

```json
{
  "status": "completed",
  "meta_data": [
    {
      "key": "tracking_number",
      "value": "TRACK123456"
    }
  ]
}
```

---

## Security Features

### 1. CSRF Protection

- Token generated on page load
- Stored in cookie and sent in request
- Validated on server

### 2. Idempotency

- Prevents duplicate orders
- Key generated from cart contents + user + total
- Results cached for 5 minutes

### 3. Order Locking

- Prevents race conditions
- Locks order creation for 2 minutes
- Automatic cleanup

---

## Payment Methods

### Online Payments
- `paypal` - PayPal (requires payment processing)
- `stripe` - Credit Card via Stripe

### Offline Payments
- `cod` - Cash on Delivery
- `bacs` - Direct Bank Transfer
- `bank_transfer` - Bank Transfer
- `cheque` - Cheque Payment

---

## Order Status Flow

1. **Pending** - Order created, payment not processed (offline payments)
2. **Processing** - Payment received, order being prepared
3. **Completed** - Order fulfilled and delivered
4. **Cancelled** - Order cancelled
5. **Refunded** - Order refunded

---

## Custom Fields

### NDIS Number
- Stored in order meta_data
- Key: `"NDIS Number"`
- Optional field

### HCP Number
- Stored in order meta_data
- Key: `"HCP Number"`
- Optional field

### Delivery Authority
- Values: `"with_signature"` or `"without_signature"`
- Stored as: `"With Signature"` or `"Without Signature"`

### Delivery Instructions
- Free text field
- Stored in order meta_data

---

## Error Handling

### 400 Bad Request
- Missing required fields
- Invalid data format
- Cart validation failed

### 403 Forbidden
- Invalid CSRF token

### 409 Conflict
- Order lock acquired (retry after delay)

### 500 Internal Server Error
- WooCommerce API error
- Payment processing failure

---

## Testing

### Test with cURL

```bash
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: your-token" \
  -H "x-user-id: 123" \
  -d '{
    "billing": {
      "first_name": "Test",
      "last_name": "User",
      "email": "test@example.com",
      "phone": "+61 400 000 000",
      "address_1": "123 Test St",
      "city": "Sydney",
      "state": "NSW",
      "postcode": "2000",
      "country": "AU"
    },
    "payment_method": "cod",
    "line_items": [
      {
        "product_id": 123,
        "quantity": 1,
        "name": "Test Product",
        "price": "10.00",
        "sku": "TEST-123",
        "slug": "test-product"
      }
    ],
    "shipping_lines": [],
    "csrf_token": "your-token",
    "total": 10.00
  }'
```

---

## Integration Checklist

- [x] CSRF protection
- [x] Idempotency handling
- [x] Order locking
- [x] Payment validation
- [x] Cart synchronization
- [x] NDIS/HCP fields
- [x] Delivery options
- [x] Offline payment support
- [x] Error handling
- [x] Order review page


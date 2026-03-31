# Custom Checkout Page Implementation

## Overview

A complete checkout page built with **React Hook Form** and **Yup** validation, integrated with WooCommerce REST API for order creation.

---

## Features

✅ **React Hook Form** - Form state management and validation  
✅ **Yup Schema Validation** - Comprehensive form validation  
✅ **Billing & Shipping Forms** - Separate or same address option  
✅ **Payment Method Selection** - PayPal, COD, Bank Transfer  
✅ **Shipping Method Selection** - Dynamic shipping rates  
✅ **WooCommerce Integration** - Direct order creation via REST API  
✅ **Success Handling** - Toast notification + redirect to thank you page  

---

## Implementation

### 1. Form Schema (Yup Validation)

```typescript
const checkoutSchema = yup.object({
  billing: yup.object({
    first_name: yup.string().required("First name is required"),
    last_name: yup.string().required("Last name is required"),
    email: yup.string().email("Invalid email").required("Email is required"),
    phone: yup.string().required("Phone is required"),
    address_1: yup.string().required("Address is required"),
    city: yup.string().required("City is required"),
    postcode: yup.string().required("Postcode is required"),
    country: yup.string().required("Country is required"),
    state: yup.string().required("State is required"),
  }),
  shipping: yup.object({
    // Conditional validation - only required if shipToDifferentAddress is true
    first_name: yup.string().when("$shipToDifferentAddress", {
      is: true,
      then: (schema) => schema.required("First name is required"),
      otherwise: (schema) => schema.notRequired(),
    }),
    // ... other shipping fields
  }),
  shippingMethod: yup.object().required("Please select a shipping method"),
  paymentMethod: yup.string().required("Please select a payment method"),
  termsAccepted: yup.boolean().oneOf([true], "You must accept the terms and conditions"),
});
```

### 2. React Hook Form Setup

```typescript
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

const {
  register,
  handleSubmit,
  control,
  watch,
  setValue,
  formState: { errors },
} = useForm<CheckoutFormData>({
  resolver: yupResolver(checkoutSchema),
  defaultValues: {
    billing: {
      first_name: "",
      last_name: "",
      email: user?.email || "",
      // ... other fields
    },
    // ... other defaults
  },
  context: { shipToDifferentAddress },
});
```

### 3. Form Fields

#### Billing Details

```typescript
<input
  {...register("billing.first_name")}
  className={`w-full rounded border px-3 py-2 text-sm ${
    errors.billing?.first_name ? "border-rose-500" : "border-gray-300"
  }`}
  placeholder="First name"
/>
{errors.billing?.first_name && (
  <p className="mt-1 text-xs text-rose-600">
    {errors.billing.first_name.message}
  </p>
)}
```

#### Shipping Address (Conditional)

```typescript
<input
  type="checkbox"
  {...register("shipToDifferentAddress")}
/>

{watchedShipToDifferent && (
  <div>
    <input {...register("shipping.first_name")} />
    {/* ... other shipping fields */}
  </div>
)}
```

#### Payment Method (Controller)

```typescript
<Controller
  name="paymentMethod"
  control={control}
  render={({ field }) => (
    <div>
      {enabledPaymentMethods.map((method) => (
        <label>
          <input
            type="radio"
            checked={field.value === method.id}
            onChange={() => field.onChange(method.id)}
          />
          {method.title}
        </label>
      ))}
    </div>
  )}
/>
```

### 4. Form Submission

```typescript
const onSubmit = async (data: CheckoutFormData) => {
  setPlacing(true);

  try {
    // 1. Sync cart with WooCommerce
    await syncWithWooCommerce();

    // 2. Process payment (if PayPal)
    if (data.paymentMethod === "paypal") {
      const paymentRes = await fetch("/api/payments/process", {
        method: "POST",
        body: JSON.stringify({
          payment_method: data.paymentMethod,
          amount: total,
          billing: data.billing,
        }),
      });
      // Handle payment response...
    }

    // 3. Create order in WooCommerce
    const orderRes = await fetch("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        payment_method: data.paymentMethod,
        billing: data.billing,
        shipping: data.shipToDifferentAddress ? data.shipping : data.billing,
        line_items: items.map((i) => ({
          product_id: i.productId,
          variation_id: i.variationId,
          quantity: i.qty,
        })),
        shipping_lines: data.shippingMethod ? [{
          method_id: data.shippingMethod.method_id,
          total: String(data.shippingMethod.cost),
        }] : [],
        meta_data: [
          { key: "delivery_authority", value: data.deliveryAuthority },
          { key: "delivery_instructions", value: data.deliveryInstructions },
        ],
      }),
    });

    const orderData = await orderRes.json();

    if (orderData.id) {
      // 4. Show success message
      success("Order placed successfully!");

      // 5. Clear cart
      clear();

      // 6. Redirect to thank you page
      router.replace(`/checkout/thank-you?order_id=${orderData.id}`);
    }
  } catch (error) {
    showError("An error occurred while placing your order");
  } finally {
    setPlacing(false);
  }
};
```

---

## API Integration

### WooCommerce Order Creation

**Endpoint:** `POST /api/orders`

**Request Body:**
```json
{
  "payment_method": "paypal",
  "payment_method_title": "PayPal",
  "payment_intent_id": "txn_123",
  "set_paid": true,
  "billing": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "1234567890",
    "address_1": "123 Main St",
    "city": "Sydney",
    "postcode": "2000",
    "country": "AU",
    "state": "NSW"
  },
  "shipping": { /* same structure as billing */ },
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
  "meta_data": [
    {
      "key": "delivery_authority",
      "value": "with_signature"
    }
  ]
}
```

**Response:**
```json
{
  "id": 12345,
  "order_number": "12345",
  "status": "processing",
  "total": "199.98",
  "currency": "AUD"
}
```

---

## Form Features

### Auto-fill Shipping from Billing

```typescript
useEffect(() => {
  if (!watchedShipToDifferent && watchedBilling?.first_name) {
    setValue("shipping", {
      first_name: watchedBilling.first_name,
      last_name: watchedBilling.last_name,
      // ... copy all billing fields
    });
  }
}, [watchedShipToDifferent, watchedBilling, setValue]);
```

### Dynamic Shipping Rates

```typescript
useEffect(() => {
  const shippingCountry = watchedShipToDifferent
    ? watchedShipping?.country
    : watchedBilling?.country;

  fetch(`/api/shipping/rates?country=${shippingCountry}`)
    .then(res => res.json())
    .then(data => {
      setRates(data.rates);
      if (data.rates.length > 0) {
        setValue("shippingMethod", data.rates[0]);
      }
    });
}, [watchedBilling?.country, watchedShipping?.country, watchedShipToDifferent]);
```

### Real-time Validation

- **Email validation** - Checks format
- **Required fields** - All billing fields required
- **Conditional shipping** - Shipping fields only required if different address
- **Payment method** - Must select a payment method
- **Shipping method** - Must select a shipping method
- **Terms acceptance** - Must accept terms and conditions

---

## Success Flow

1. **Form Validation** - React Hook Form validates all fields
2. **Cart Sync** - Syncs cart with WooCommerce for price validation
3. **Payment Processing** - Processes payment (if PayPal)
4. **Order Creation** - Creates order in WooCommerce via REST API
5. **Success Message** - Shows toast notification
6. **Cart Clear** - Clears cart after successful order
7. **Redirect** - Redirects to `/checkout/thank-you?order_id={id}`

---

## Error Handling

- **Validation Errors** - Displayed inline below each field
- **Payment Errors** - Shown via toast notification
- **Order Creation Errors** - Displayed with error message
- **Network Errors** - Caught and displayed to user

---

## Usage

### Access Checkout

Navigate to `/checkout` (requires valid access token and cart items)

### Form Submission

1. Fill in billing details
2. (Optional) Check "Ship to different address" and fill shipping
3. Select shipping method
4. Select payment method
5. Accept terms and conditions
6. Click "Place Order"

### Success

- Toast notification: "Order placed successfully!"
- Redirect to: `/checkout/thank-you?order_id={id}`
- Cart is cleared automatically

---

## Files

- **`app/checkout/page.tsx`** - Main checkout page with React Hook Form
- **`app/api/orders/route.ts`** - WooCommerce order creation API
- **`app/checkout/thank-you/page.tsx`** - Thank you page (already exists)

---

## Dependencies

- `react-hook-form` - Form state management
- `@hookform/resolvers` - Yup resolver for React Hook Form
- `yup` - Schema validation

All dependencies are already installed in `package.json`.

---

## Notes

- Old checkout page backed up as `app/checkout/page-old.tsx`
- Form validation happens client-side before submission
- All sensitive operations (payment, order creation) happen server-side
- Cart is synced with WooCommerce before order creation to ensure accurate prices


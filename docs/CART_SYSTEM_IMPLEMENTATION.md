# Cart System Implementation Guide

Complete cart system implementation using Context API with WooCommerce REST API integration.

## Architecture

### Components

1. **CartProvider** (`components/CartProvider.tsx`)
   - Context API for global cart state
   - localStorage persistence
   - WooCommerce API sync functions

2. **MiniCartDrawer** (`components/MiniCartDrawer.tsx`)
   - Slide-out cart drawer
   - Real-time totals
   - Quick checkout

3. **Cart Page** (`app/cart/page.tsx`)
   - Full cart view
   - Quantity updates
   - Order summary

4. **Cart Sync** (`lib/cart-sync.ts`)
   - WooCommerce API integration
   - Price validation
   - Stock checking

## CartProvider Implementation

### Context API Setup

```typescript
import { useCart } from '@/components/CartProvider';

function MyComponent() {
  const { 
    items, 
    addItem, 
    removeItem, 
    updateItemQty, 
    total,
    syncWithWooCommerce,
    validateCart 
  } = useCart();
  
  // Use cart functions
}
```

### Features

- ✅ **localStorage Persistence**: Cart persists across sessions
- ✅ **WooCommerce Sync**: Real-time price and stock validation
- ✅ **Auto-sync**: Optional automatic sync on cart changes
- ✅ **Error Handling**: Sync errors tracked and displayed
- ✅ **Type Safety**: Full TypeScript support

## API Endpoints

### 1. Sync Cart with WooCommerce

**Endpoint:** `POST /api/cart/sync`

**Request:**
```json
{
  "items": [
    {
      "id": "123",
      "productId": 123,
      "variationId": 456,
      "name": "Product Name",
      "price": "99.99",
      "qty": 2
    }
  ],
  "couponCode": "SAVE10" // optional
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
    "tax_total": "20.00",
    "shipping_total": "0.00",
    "discount_total": "0.00"
  }
}
```

### 2. Validate Cart Items

**Endpoint:** `POST /api/cart/validate`

**Request:**
```json
{
  "items": [...]
}
```

**Response:**
```json
{
  "valid": true,
  "errors": []
}
```

### 3. Update Cart Prices

**Endpoint:** `POST /api/cart/prices`

**Request:**
```json
{
  "items": [...]
}
```

**Response:**
```json
{
  "success": true,
  "prices": {
    "123": "99.99",
    "123:456": "89.99"
  }
}
```

## Usage Examples

### Adding Items to Cart

```typescript
import { useCart } from '@/components/CartProvider';

function ProductCard({ product }) {
  const { addItem, open } = useCart();
  
  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      qty: 1,
      imageUrl: product.images?.[0]?.src,
      sku: product.sku,
    });
    open(); // Open mini cart
  };
  
  return (
    <button onClick={handleAddToCart}>
      Add to Cart
    </button>
  );
}
```

### Syncing Cart with WooCommerce

```typescript
import { useCart } from '@/components/CartProvider';

function CheckoutButton() {
  const { items, syncWithWooCommerce, isSyncing } = useCart();
  
  const handleCheckout = async () => {
    // Sync cart before checkout
    await syncWithWooCommerce();
    // Navigate to checkout
    router.push('/checkout');
  };
  
  return (
    <button 
      onClick={handleCheckout}
      disabled={isSyncing}
    >
      {isSyncing ? 'Syncing...' : 'Checkout'}
    </button>
  );
}
```

### Validating Cart Before Checkout

```typescript
import { useCart } from '@/components/CartProvider';

function CheckoutPage() {
  const { items, validateCart } = useCart();
  const [validationErrors, setValidationErrors] = useState([]);
  
  useEffect(() => {
    const validate = async () => {
      const result = await validateCart();
      if (!result.valid) {
        setValidationErrors(result.errors);
      }
    };
    validate();
  }, [items, validateCart]);
  
  return (
    <div>
      {validationErrors.map(error => (
        <div key={error.itemId} className="error">
          {error.message}
        </div>
      ))}
    </div>
  );
}
```

## Cart State Management

### localStorage Structure

```typescript
// Stored in localStorage as "cart:v1"
[
  {
    "id": "123:456",
    "productId": 123,
    "variationId": 456,
    "name": "Product Name",
    "price": "99.99",
    "qty": 2,
    "imageUrl": "https://...",
    "sku": "SKU123"
  }
]
```

### State Updates

- **Add Item**: Merges with existing items or adds new
- **Update Quantity**: Updates item quantity (min 1)
- **Remove Item**: Filters out item by ID
- **Clear Cart**: Removes all items

## WooCommerce Integration

### Sync Process

1. **Client adds item** → Stored in localStorage
2. **Before checkout** → Sync with WooCommerce
3. **WooCommerce validates**:
   - Stock availability
   - Current prices
   - Product availability
4. **Prices updated** → Cart reflects WooCommerce prices
5. **Proceed to checkout** → Use validated cart data

### Price Validation

Cart prices are validated against WooCommerce:
- Sale prices applied automatically
- Regular prices updated if changed
- Variation prices handled correctly

### Stock Validation

Before checkout:
- Check stock status (in stock/out of stock)
- Verify quantity availability
- Handle backorders if allowed

## Mini Cart Drawer

### Features

- Slide-out from right
- Real-time totals
- Quantity updates
- Remove items
- Shipping options
- Coupon codes
- Quick checkout

### Usage

```typescript
import MiniCartDrawer from '@/components/MiniCartDrawer';

function Layout() {
  return (
    <>
      <Header />
      <MiniCartDrawer />
    </>
  );
}
```

## Cart Page

### Features

- Full cart view
- Edit quantities
- Remove items
- Order summary
- Coupon application
- Proceed to checkout

### Route

`/cart` - Full cart page with order summary

## Best Practices

### 1. Always Sync Before Checkout

```typescript
await syncWithWooCommerce();
// Then proceed to checkout
```

### 2. Validate Cart Periodically

```typescript
// Validate on page load
useEffect(() => {
  validateCart();
}, []);
```

### 3. Handle Sync Errors

```typescript
const { syncError } = useCart();

if (syncError) {
  // Show error to user
  // Allow manual retry
}
```

### 4. Update Prices Regularly

```typescript
// Sync prices every 5 minutes
useEffect(() => {
  const interval = setInterval(() => {
    syncWithWooCommerce();
  }, 5 * 60 * 1000);
  
  return () => clearInterval(interval);
}, []);
```

## Error Handling

### Sync Errors

- Network failures
- Invalid products
- Out of stock items
- Price mismatches

### User Feedback

- Show sync status
- Display validation errors
- Allow manual retry
- Clear error on success

## Performance

- **Debounced Sync**: Prevents excessive API calls
- **Batch Updates**: Multiple items synced together
- **Cached Prices**: Prices cached for 5 minutes
- **Optimistic Updates**: UI updates immediately

## Security

- **Server-side Validation**: All validation on server
- **Price Verification**: Prices verified from WooCommerce
- **Stock Checks**: Real-time stock validation
- **No Client Manipulation**: Prices can't be modified client-side


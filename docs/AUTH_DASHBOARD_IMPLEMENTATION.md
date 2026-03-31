# Authentication and Customer Dashboard Implementation

Complete implementation of authentication and customer dashboard system with role-based access control.

## Features Implemented

### 1. Authentication System

#### Login/Register Pages
- **`app/login/page.tsx`** - Login page with JWT authentication
- **`app/register/page.tsx`** - Registration page with auto-login
- Uses WordPress REST API JWT authentication
- Secure cookie-based session management

#### Middleware Protection
- **`middleware.ts`** - Route protection middleware
- Validates JWT tokens on protected routes
- Redirects unauthenticated users to login
- Supports redirect URLs for post-login navigation

### 2. Customer Dashboard

#### Dashboard Layout
- **`app/account/layout.tsx`** - Dashboard layout with sidebar navigation
- Responsive design with mobile support
- Navigation to all dashboard sections

#### Dashboard Modules

**Dashboard Home (`app/account/page.tsx`)**
- Welcome message
- Order statistics (total orders, total spent)
- Recent orders preview
- Quick action links

**Orders Module**
- **`app/account/orders/page.tsx`** - Orders list with status indicators
- **`app/account/orders/[id]/page.tsx`** - Order detail view
- Shows order items, billing/shipping addresses
- Displays NDIS/HCP information
- Payment status indicators

**Address Book (`app/account/addresses/page.tsx`)**
- Create, read, update, delete addresses
- Support for multiple billing/shipping addresses
- Set default addresses
- Form validation

**Wishlist (`app/account/wishlist/page.tsx`)**
- Integrated with existing WishlistProvider
- Display wishlist items with product details
- Remove items from wishlist

**Account Settings (`app/account/settings/page.tsx`)**
- Update account details (name, email, phone)
- Form validation
- Success/error notifications

### 3. API Routes

#### Authentication APIs
- `/api/auth/login` - Login with JWT
- `/api/auth/register` - Register new user
- `/api/auth/me` - Get current user
- `/api/auth/logout` - Logout

#### Customer APIs
- `/api/customers/stats` - Get customer statistics
- `/api/customers/orders` - Get customer orders
- `/api/customers/addresses` - CRUD operations for addresses
- `/api/customers/me` - Get/update customer details
- `/api/customers/recipients` - Get saved recipients (for on-behalf orders)

### 4. Place Order on Behalf

**`app/checkout/on-behalf/page.tsx`**
- Form to enter recipient details
- Support for saved recipients
- NDIS/HCP number fields
- Role-based access control
- Creates order with recipient as billing/shipping

**Features:**
- Only accessible to users with `canPlaceOrderForOthers` permission
- Tracks who placed the order (`placed_by` field)
- Supports multiple shipping addresses

### 5. Role-Based Visibility

**`lib/user-roles.ts`**
- User role detection (customer, wholesale, administrator, shop_manager)
- Permission system:
  - `canViewWholesalePricing` - View wholesale prices
  - `canViewAssignedProducts` - View assigned products
  - `canPlaceOrderForOthers` - Place orders on behalf of others
  - `canManageOrders` - Manage orders

**Role Permissions:**
- **Customer**: No special permissions
- **Wholesale**: Can view wholesale pricing, assigned products, place orders for others
- **Administrator/Shop Manager**: Full permissions

### 6. Enhanced Auth Provider

**`components/AuthProvider.tsx`**
- Extended user type to include roles and capabilities
- Supports role-based access control
- Maintains authentication state across app

## Security Features

1. **JWT Token Validation**
   - Validates tokens on every protected route
   - Automatic token refresh
   - Secure cookie storage (httpOnly, SameSite)

2. **Middleware Protection**
   - Validates tokens before page load
   - Redirects unauthenticated users
   - Prevents unauthorized access

3. **Role-Based Access Control**
   - Permission checks before allowing actions
   - Role-based UI visibility
   - API-level permission validation

## Testing

**`tests/playwright-auth-dashboard.spec.ts`**
- Complete Playwright test suite covering:
  - Authentication flow (login, register, logout)
  - Address CRUD operations
  - Order history viewing
  - Dashboard navigation
  - Wishlist integration
  - Account settings updates

### Running Tests

```bash
# Install Playwright
npm install -D @playwright/test

# Run tests
npx playwright test tests/playwright-auth-dashboard.spec.ts

# Run with UI
npx playwright test --ui
```

## Usage Examples

### Check User Role

```typescript
import { useAuth } from "@/components/AuthProvider";
import { getUserRole, canPlaceOrderForOthers } from "@/lib/user-roles";

function MyComponent() {
  const { user } = useAuth();
  const role = getUserRole(user);
  const canPlace = canPlaceOrderForOthers(user);
  
  // ...
}
```

### Protect Route

```typescript
// Middleware automatically protects routes starting with /account
// Or use HOC:
import withAuth from "@/hoc/withAuth";

export default withAuth(MyProtectedComponent);
```

### Place Order on Behalf

```typescript
// Navigate to /checkout/on-behalf
// Only accessible if user has canPlaceOrderForOthers permission
```

## File Structure

```
app/
├── login/
│   └── page.tsx
├── register/
│   └── page.tsx
├── account/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── orders/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   ├── addresses/
│   │   └── page.tsx
│   ├── wishlist/
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx
└── checkout/
    └── on-behalf/
        └── page.tsx

api/
├── auth/
│   ├── login/
│   ├── register/
│   ├── me/
│   └── logout/
└── customers/
    ├── stats/
    ├── orders/
    ├── addresses/
    ├── me/
    └── recipients/

lib/
├── user-roles.ts
└── auth.ts

middleware.ts
tests/
└── playwright-auth-dashboard.spec.ts
```

## Environment Variables

Required environment variables:
- `WC_API_URL` - WooCommerce API URL
- `WC_CONSUMER_KEY` - API Consumer Key
- `WC_CONSUMER_SECRET` - API Consumer Secret

## Next Steps

1. **Wholesale Pricing**: Implement wholesale price display in ProductCard
2. **Assigned Products**: Filter products based on user assignments
3. **Recipient Management**: Store recipients in database for reuse
4. **Order Management**: Admin interface for managing orders
5. **Email Notifications**: Send order confirmations and updates

## Notes

- All protected routes require authentication
- Role-based features require proper WordPress role assignment
- JWT tokens expire after 7 days (configurable)
- Address book currently uses WooCommerce customer default addresses
- Recipients for on-behalf orders can be extended to use a custom table


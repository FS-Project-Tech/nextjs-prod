# Authentication Implementation Guide

## Overview

Complete JWT-based authentication system integrated with WordPress/WooCommerce, including login, registration, password recovery, and protected customer dashboard.

## Features

✅ **JWT Authentication** - Secure token-based authentication  
✅ **HttpOnly Cookies** - Tokens stored securely server-side  
✅ **Protected Routes** - Middleware-based route protection  
✅ **Password Recovery** - Forgot and reset password flows  
✅ **Rate Limiting** - Protection against brute force attacks  
✅ **reCAPTCHA v3** - Optional bot protection  
✅ **Form Validation** - React Hook Form + Yup validation  
✅ **Toast Notifications** - User feedback for all actions  

## File Structure

```
app/
├── api/auth/
│   ├── login/route.ts          # Login endpoint
│   ├── register/route.ts        # Registration endpoint
│   ├── forgot/route.ts          # Forgot password endpoint
│   ├── reset/route.ts          # Reset password endpoint
│   ├── me/route.ts             # Get current user
│   └── logout/route.ts         # Logout endpoint
├── login/page.tsx              # Login page
├── register/page.tsx           # Registration page
├── forgot/page.tsx             # Forgot password page
├── reset/page.tsx              # Reset password page
└── account/page.tsx            # Protected account dashboard

components/
├── auth/
│   ├── LoginForm.tsx           # Login form component
│   ├── RegisterForm.tsx        # Registration form component
│   ├── ForgotForm.tsx          # Forgot password form
│   └── ResetForm.tsx           # Reset password form
└── AuthProvider.tsx            # Auth context provider

lib/
├── auth.ts                     # Auth utilities (cookies, validation)
├── rate-limit.ts               # Rate limiting
└── recaptcha.ts                # reCAPTCHA verification

hooks/
└── useUser.ts                  # useUser hook

middleware.ts                   # Route protection middleware
```

## Setup Instructions

### 1. WordPress Setup

1. Install **JWT Authentication for WP REST API** plugin:
   ```
   https://wordpress.org/plugins/jwt-authentication-for-wp-rest-api/
   ```

2. Add the PHP code from `docs/wordpress-endpoints.php` to your theme's `functions.php` or create a custom plugin.

3. Configure JWT secret key in `wp-config.php`:
   ```php
   define('JWT_AUTH_SECRET_KEY', 'your-secret-key-here');
   define('JWT_AUTH_CORS_ENABLE', true);
   ```

### 2. Environment Variables

Add to `.env.local`:

```env
# WooCommerce API (required)
WC_API_URL=https://your-site.com/wp-json/wc/v3

# reCAPTCHA (optional)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-site-key
RECAPTCHA_SECRET_KEY=your-secret-key
```

### 3. Install Dependencies

All required dependencies are already in `package.json`:
- `axios` - HTTP client
- `react-hook-form` - Form handling
- `yup` - Validation
- `@hookform/resolvers` - Yup resolver

## Usage

### Login

```typescript
import LoginForm from '@/components/auth/LoginForm';

<LoginForm onSuccess={() => router.push('/account')} />
```

### Register

```typescript
import RegisterForm from '@/components/auth/RegisterForm';

<RegisterForm />
```

### Protected Routes

Routes are automatically protected by middleware:
- `/account` - Customer dashboard
- `/checkout` - Checkout page
- `/orders` - Orders page

### Using Auth in Components

```typescript
import { useAuth } from '@/components/AuthProvider';

function MyComponent() {
  const { user, loading, logout } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not logged in</div>;
  
  return <div>Welcome, {user.name}!</div>;
}
```

### Using useUser Hook

```typescript
import { useUser } from '@/hooks/useUser';

function MyComponent() {
  const { user, isAuthenticated, logout } = useUser();
  
  // ...
}
```

## API Endpoints

### POST `/api/auth/login`
```json
{
  "username": "user@example.com",
  "password": "password123",
  "recaptchaToken": "optional"
}
```

### POST `/api/auth/register`
```json
{
  "email": "user@example.com",
  "username": "optional",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "recaptchaToken": "optional"
}
```

### POST `/api/auth/forgot`
```json
{
  "email": "user@example.com"
}
```

### POST `/api/auth/reset`
```json
{
  "token": "reset-token",
  "email": "user@example.com",
  "password": "newpassword123"
}
```

### GET `/api/auth/me`
Returns current user data (requires authentication).

### POST `/api/auth/logout`
Logs out user and clears session cookie.

## Security Features

### Rate Limiting
- 5 requests per 15 minutes per identifier (IP + username/email)
- Prevents brute force attacks
- Configurable in `lib/rate-limit.ts`

### reCAPTCHA v3
- Optional bot protection
- Score-based verification (threshold: 0.5)
- Configure in `.env.local`

### HttpOnly Cookies
- JWT tokens stored in secure, HttpOnly cookies
- Never exposed to client-side JavaScript
- Automatic CSRF protection

### Generic Error Messages
- "Invalid credentials" instead of "User not found"
- Prevents user enumeration attacks

## Testing Checklist

- [ ] User can register new account
- [ ] User can login with credentials
- [ ] User can request password reset
- [ ] User can reset password with valid token
- [ ] Protected routes redirect to login when not authenticated
- [ ] User can logout successfully
- [ ] Session persists across page refreshes
- [ ] Invalid tokens are rejected
- [ ] Rate limiting works correctly
- [ ] reCAPTCHA verification works (if enabled)

## Troubleshooting

### "WordPress URL not configured"
- Check `WC_API_URL` in `.env.local`
- Ensure URL is accessible

### "JWT token validation failed" / "JWT is not configured properly" / Login then immediate logout
- See **[JWT_WORDPRESS_SETUP.md](./JWT_WORDPRESS_SETUP.md)** for full steps.
- Use a **dedicated** `JWT_AUTH_SECRET_KEY` in `wp-config.php` (not `AUTH_KEY`).
- Ensure the server passes the `Authorization` header to PHP (e.g. `.htaccess` on Apache).

### "Registration endpoint not found"
- Ensure PHP code from `docs/wordpress-endpoints.php` is added
- Check WordPress REST API is enabled

### Rate limiting too strict
- Adjust `MAX_REQUESTS` and `RATE_LIMIT_WINDOW` in `lib/rate-limit.ts`
- For production, use Redis-based rate limiting

## Production Considerations

1. **Use Redis for Rate Limiting** - Replace in-memory store with Redis
2. **Enable reCAPTCHA** - Add site key and secret key
3. **HTTPS Only** - Ensure `secure` flag is set in production
4. **Monitor Failed Logins** - Log and alert on suspicious activity
5. **Token Refresh** - Implement token refresh mechanism for long sessions
6. **Email Templates** - Customize password reset emails
7. **Password Strength** - Enforce stronger password requirements

## Next Steps

- Add email verification for new registrations
- Implement two-factor authentication (2FA)
- Add social login (Google, Facebook)
- Create order history page
- Add address book management
- Implement wishlist sync with user account

